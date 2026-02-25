const OpenAI = require('openai');
const { updateConversationStage, updateConversation, updateCustomer, getDocumentsByConversation } = require('../db/queries');
const { getRequiredDocuments, getServiceFields } = require('./systemPrompt');
const { createCustomerFolder } = require('../drive/folderManager');

const SERVICE_TYPE_MAP = {
  '1': 'personal_loan', 'personal': 'personal_loan', 'personal loan': 'personal_loan',
  '2': 'home_loan', 'home': 'home_loan', 'home loan': 'home_loan', 'house loan': 'home_loan',
  '3': 'auto_loan', 'auto': 'auto_loan', 'auto loan': 'auto_loan', 'car loan': 'auto_loan', 'vehicle loan': 'auto_loan',
  '4': 'education_loan', 'education': 'education_loan', 'education loan': 'education_loan', 'student loan': 'education_loan',
  '5': 'credit_repair', 'credit': 'credit_repair', 'credit score': 'credit_repair', 'credit repair': 'credit_repair', 'fix credit': 'credit_repair',
};

function detectServiceType(text) {
  const lower = text.toLowerCase().trim();
  for (const [key, value] of Object.entries(SERVICE_TYPE_MAP)) {
    if (lower.includes(key)) return value;
  }
  return null;
}

function hasRequiredPersonalInfo(data) {
  return !!(data.full_name && data.city && data.monthly_income && data.employment_type);
}

function hasRequiredServiceInfo(serviceType, data) {
  const required = getServiceFields(serviceType);
  return required.every(field => !!data[field]);
}

function userConfirmed(text) {
  const lower = text.toLowerCase();
  return ['yes', 'correct', 'confirm', 'ok', 'okay', 'haan', 'bilkul', 'right', 'approved', 'confirmed', 'proceed', 'sure'].some(w => lower.includes(w));
}

async function extractStructuredData(stage, serviceType, userInput, existingData) {
  if (!userInput || userInput.trim().length < 2) return {};

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Extract structured data from this customer message in a financial services context (India).
Current stage: ${stage}. Service selected: ${serviceType || 'not yet'}.
Already collected: ${JSON.stringify(existingData)}.

Customer message: "${userInput}"

Return ONLY valid JSON. Extract any of these fields if mentioned:
- full_name (string)
- city (string, Indian city)
- monthly_income (number in INR)
- employment_type ("salaried" | "self_employed" | "business_owner")
- employer_name (string)
- loan_amount_required (number in INR, handle lakhs/crores)
- loan_purpose (string)
- property_location (string)
- property_value (number in INR)
- property_status ("under_construction" | "ready" | "plot")
- vehicle_type ("new" | "used")
- vehicle_make_model (string)
- vehicle_cost (number in INR)
- student_name (string)
- course_name (string)
- institution_name (string)
- institution_type ("india" | "abroad")
- total_course_fee (number in INR)
- parent_monthly_income (number in INR)
- current_credit_score (number)
- total_outstanding_debt (number in INR)
- number_of_overdue_accounts (number)
- reason_for_poor_score (string)
- email (string, if mentioned)
- co_applicant_name (string, if mentioned)
- down_payment_amount (number in INR, if mentioned)

If a lakh amount is mentioned (e.g. "5 lakhs"), convert to full number (500000).
If nothing extractable, return {}.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content) || {};
  } catch (err) {
    console.error('Data extraction error:', err.message);
    return {};
  }
}

async function advanceStageIfReady(customer, conversation, userInput, botReply) {
  const stage = conversation.stage;
  const serviceType = conversation.service_type;
  const collectedData = JSON.parse(conversation.collected_data || '{}');

  // Extract structured data from user's message
  const extracted = await extractStructuredData(stage, serviceType, userInput, collectedData);
  const merged = { ...collectedData, ...extracted };

  let nextStage = stage;
  let nextServiceType = serviceType;

  if (stage === 'greeting') {
    const detected = detectServiceType(userInput);
    if (detected) {
      nextServiceType = detected;
      nextStage = 'personal_info';
      await updateConversation(conversation.id, { service_type: detected });
    }
  } else if (stage === 'personal_info') {
    if (hasRequiredPersonalInfo(merged)) {
      nextStage = 'service_specific_info';

      // Create Drive folder now that we have the customer's name
      if (!customer.drive_folder_id && merged.full_name) {
        try {
          const folder = await createCustomerFolder(customer, merged.full_name);
          await updateCustomer(customer.id, {
            drive_folder_id: folder.id,
            drive_folder_url: folder.url,
            name: merged.full_name,
            city: merged.city || customer.city,
          });
          customer.drive_folder_id = folder.id;
          customer.drive_folder_url = folder.url;
        } catch (err) {
          console.error('Drive folder creation error:', err.message);
        }
      }

      if (merged.full_name) {
        await updateCustomer(customer.id, { name: merged.full_name, city: merged.city });
      }
    }
  } else if (stage === 'service_specific_info') {
    if (nextServiceType && hasRequiredServiceInfo(nextServiceType, merged)) {
      nextStage = 'document_request';
      merged.pending_documents = getRequiredDocuments(nextServiceType);
    }
  } else if (stage === 'document_request') {
    // Transition to collection after bot has listed docs
    nextStage = 'document_collection';
  } else if (stage === 'document_collection') {
    // Check if all required documents have been uploaded
    const uploadedDocs = getDocumentsByConversation(conversation.id);
    const required = getRequiredDocuments(nextServiceType || serviceType);
    const uploadedTypes = uploadedDocs.map(d => d.document_type);
    const allDone = required.every(r => uploadedTypes.some(u => u.startsWith(r.replace(/_\d+$/, ''))));
    if (allDone || (merged.pending_documents && merged.pending_documents.length === 0)) {
      nextStage = 'summary_confirmation';
    }
  } else if (stage === 'summary_confirmation') {
    if (userConfirmed(userInput)) {
      nextStage = 'completed';
      await updateConversation(conversation.id, { status: 'completed' });
    }
  }

  await updateConversationStage(conversation.id, nextStage, merged);

  return { nextStage, collectedData: merged };
}

module.exports = { advanceStageIfReady, detectServiceType };
