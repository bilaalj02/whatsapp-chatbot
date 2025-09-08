// Test script for the WhatsApp Lead Bot
require('dotenv').config();

// Test lead parsing function
function parseLeadInfo(text) {
  const leadData = {};
  
  // Try labeled format first
  const labeledPatterns = {
    name: /name:\s*([^\n]+)/i,
    business: /business:\s*([^\n]+)/i,
    email: /email:\s*([^\n\s]+)/i,
    phone: /phone:\s*([^\n]+)/i
  };
  
  // Extract labeled information
  for (const [key, pattern] of Object.entries(labeledPatterns)) {
    const match = text.match(pattern);
    if (match) {
      leadData[key] = match[1].trim();
    }
  }
  
  // If we have labeled data, return it
  if (leadData.name && (leadData.email || leadData.phone)) {
    return leadData;
  }
  
  // Try unlabeled format - extract email, phone, and assume rest is name/business
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const phoneMatch = text.match(/[\+]?[1-9]?[\d\s\-\(\)]{10,}/);
  
  if (emailMatch) {
    leadData.email = emailMatch[1];
    
    // Remove email from text to find name/business
    let remainingText = text.replace(emailMatch[0], '').trim();
    
    // Remove phone if found
    if (phoneMatch) {
      leadData.phone = phoneMatch[0].trim();
      remainingText = remainingText.replace(phoneMatch[0], '').trim();
    }
    
    // Split remaining text - first part is likely name, second part business
    const parts = remainingText.split(/\s{2,}|\n/).filter(part => part.trim().length > 0);
    
    if (parts.length >= 1) {
      // If email domain suggests business name, use that logic
      const domain = emailMatch[1].split('@')[0];
      
      if (parts.length === 1) {
        // Only one part - check if it looks like a business name
        const singlePart = parts[0].trim();
        if (singlePart.toLowerCase().includes('homes') || 
            singlePart.toLowerCase().includes('construction') ||
            singlePart.toLowerCase().includes('llc') ||
            singlePart.toLowerCase().includes('inc') ||
            singlePart.toLowerCase().includes('corp')) {
          leadData.business = singlePart;
          leadData.name = singlePart; // Use business name as contact name
        } else {
          leadData.name = singlePart;
        }
      } else {
        // Multiple parts - first is name, rest is business
        leadData.name = parts[0].trim();
        leadData.business = parts.slice(1).join(' ').trim();
      }
    } else {
      // No clear text parts, use email prefix as name fallback
      leadData.name = domain;
    }
    
    return leadData;
  }
  
  return null;
}

// Test cases
const testMessages = [
  {
    name: "Valid lead with all info (labeled)",
    message: `Name: John Smith
Business: Smith Construction
Email: john@smithconstruction.com
Phone: (555) 123-4567`
  },
  {
    name: "Valid lead with minimal info (labeled)",
    message: `Name: Jane Doe
Email: jane@example.com`
  },
  {
    name: "Unlabeled format - email and business name",
    message: `ACBurtonHomes@outlook.com
AC Burton Homes`
  },
  {
    name: "Unlabeled format - single line",
    message: `ACBurtonHomes@outlook.com AC Burton Homes`
  },
  {
    name: "Unlabeled format - with phone",
    message: `john@smithconstruction.com John Smith Smith Construction 555-123-4567`
  },
  {
    name: "Unlabeled format - business keywords detected",
    message: `contact@homesllc.com Homes LLC`
  },
  {
    name: "Invalid lead - no contact info",
    message: `Name: Bob Johnson
Business: Johnson Corp`
  },
  {
    name: "Case insensitive test (labeled)",
    message: `name: alice cooper
business: cooper music
email: alice@cooper.com
phone: 555-999-8888`
  }
];

console.log('🧪 Testing Lead Parser\n');

testMessages.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log(`Input: ${test.message.replace(/\n/g, ' | ')}`);
  
  const result = parseLeadInfo(test.message);
  
  if (result) {
    console.log('✅ Parsed successfully:');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('❌ Failed to parse');
  }
  
  console.log('---\n');
});

// Test environment variables
console.log('🔧 Environment Variables Check\n');

const requiredEnvVars = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'VERIFY_TOKEN',
  'NOTION_TOKEN',
  'NOTION_DATABASE_ID'
];

requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (value && value !== `your_${envVar.toLowerCase()}`) {
    console.log(`✅ ${envVar}: Set`);
  } else {
    console.log(`❌ ${envVar}: Not configured`);
  }
});

console.log('\n🚀 Ready to test with your WhatsApp Business API and Notion setup!');