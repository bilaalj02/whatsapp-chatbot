require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Client } = require('@notionhq/client');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// WhatsApp webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// WhatsApp webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      body.entry.forEach(async (entry) => {
        const changes = entry.changes;
        
        changes.forEach(async (change) => {
          if (change.field === 'messages') {
            const messages = change.value.messages;
            
            if (messages) {
              for (const message of messages) {
                await handleIncomingMessage(message, change.value.metadata.phone_number_id);
              }
            }
          }
        });
      });

      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Handle incoming WhatsApp messages
async function handleIncomingMessage(message, phoneNumberId) {
  try {
    if (message.type === 'text') {
      const messageText = message.text.body;
      const fromNumber = message.from;
      
      console.log(`Received message from ${fromNumber}: ${messageText}`);
      
      // Parse lead information from message
      const leadData = parseLeadInfo(messageText);
      console.log('Parsed lead data:', JSON.stringify(leadData));
      
      if (leadData) {
        console.log('Lead data is valid, attempting to store...');
        try {
          // Store lead in Notion
          const result = await storeLead(leadData, fromNumber);
          console.log('Successfully stored lead:', result.id);
          
          // Send confirmation message
          await sendWhatsAppMessage(
            fromNumber,
            phoneNumberId,
            '✅ Lead information received and stored successfully!'
          );
        } catch (storeError) {
          console.error('Failed to store lead:', storeError);
          // Send error message
          await sendWhatsAppMessage(
            fromNumber,
            phoneNumberId,
            '❌ Sorry, there was an error storing your information. Please try again.'
          );
        }
      } else {
        console.log('Lead data is invalid or missing required fields');
        // Send instructions on how to format lead info
        await sendWhatsAppMessage(
          fromNumber,
          phoneNumberId,
          'Please format lead information as:\n\n' +
          'Name: [Lead Name]\n' +
          'Business: [Business Name]\n' +
          'Email: [Email Address]\n' +
          'Phone: [Phone Number]\n\n' +
          'Or simply send:\n' +
          'email@example.com\n' +
          'Business Name'
        );
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

// Parse lead information from message text
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

// Store lead in Notion database with retry logic
async function storeLead(leadData, callerPhone, retryCount = 0) {
  const maxRetries = 3;
  
  try {
    console.log(`Attempting to store lead in Notion (attempt ${retryCount + 1})`);
    console.log('Lead data:', JSON.stringify(leadData));
    console.log('Database ID:', process.env.NOTION_DATABASE_ID);
    
    const response = await Promise.race([
      notion.pages.create({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          'Name': {
            title: [
              {
                text: {
                  content: leadData.name || 'Unknown'
                }
              }
            ]
          },
          'Business': {
            rich_text: [
              {
                text: {
                  content: leadData.business || 'N/A'
                }
              }
            ]
          },
          'Email': leadData.email ? {
            email: leadData.email
          } : {
            rich_text: []
          },
          'Phone': leadData.phone ? {
            phone_number: leadData.phone
          } : {
            rich_text: []
          },
          'Caller': {
            rich_text: [
              {
                text: {
                  content: callerPhone
                }
              }
            ]
          },
          'Date Added': {
            date: {
              start: new Date().toISOString().split('T')[0]
            }
          },
          'Status': {
            rich_text: [
              {
                text: {
                  content: 'New Lead'
                }
              }
            ]
          }
        }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000) // 10 second timeout
      )
    ]);

    console.log('Lead stored in Notion successfully:', response.id);
    return response;
  } catch (error) {
    console.error(`Error storing lead in Notion (attempt ${retryCount + 1}):`, error.message);
    
    if (retryCount < maxRetries && (error.code === 'notionhq_client_request_timeout' || error.message === 'Timeout')) {
      console.log(`Retrying in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return storeLead(leadData, callerPhone, retryCount + 1);
    }
    
    throw error;
  }
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, phoneNumberId, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Message sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test Notion connection endpoint
app.get('/test-notion', async (req, res) => {
  try {
    console.log('Testing Notion connection...');
    console.log('Database ID:', process.env.NOTION_DATABASE_ID);
    console.log('Token (first 20 chars):', process.env.NOTION_TOKEN?.substring(0, 20));
    
    // Test simple database query
    const response = await Promise.race([
      notion.databases.query({
        database_id: process.env.NOTION_DATABASE_ID,
        page_size: 1
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000)
      )
    ]);
    
    console.log('Notion connection successful!');
    res.status(200).json({ 
      status: 'Notion connection OK', 
      database_id: process.env.NOTION_DATABASE_ID,
      pages_found: response.results.length
    });
  } catch (error) {
    console.error('Notion connection failed:', error);
    res.status(500).json({ 
      status: 'Notion connection failed', 
      error: error.message,
      code: error.code
    });
  }
});

// Test creating a simple page
app.get('/test-create', async (req, res) => {
  try {
    console.log('Testing page creation...');
    
    const response = await Promise.race([
      notion.pages.create({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          'Name': {
            title: [
              {
                text: {
                  content: 'Test Entry'
                }
              }
            ]
          },
          'Business': {
            rich_text: [
              {
                text: {
                  content: 'Test Business'
                }
              }
            ]
          },
          'Email': {
            email: 'test@example.com'
          },
          'Phone': {
            phone_number: '555-123-4567'
          },
          'Caller': {
            rich_text: [
              {
                text: {
                  content: 'Test Caller'
                }
              }
            ]
          },
          'Date Added': {
            date: {
              start: new Date().toISOString().split('T')[0]
            }
          },
          'Status': {
            rich_text: [
              {
                text: {
                  content: 'Test Status'
                }
              }
            ]
          }
        }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout after 15 seconds')), 15000)
      )
    ]);
    
    console.log('Page created successfully!', response.id);
    res.status(200).json({ 
      status: 'Page created successfully', 
      page_id: response.id
    });
  } catch (error) {
    console.error('Page creation failed:', error);
    res.status(500).json({ 
      status: 'Page creation failed', 
      error: error.message,
      code: error.code
    });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp Lead Bot server running on port ${PORT}`);
});