# WhatsApp Lead Bot

A WhatsApp chatbot that receives lead information from cold callers and automatically stores it in a Notion database.

## Features

- Receives WhatsApp messages with lead information
- Parses lead data (Name, Business, Email, Phone)
- Stores leads in Notion database
- Sends confirmation messages
- Tracks which caller submitted each lead

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Update the `.env` file with your credentials:

```env
# WhatsApp Business API Configuration
WHATSAPP_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
VERIFY_TOKEN=your_verify_token_here

# Notion Configuration
NOTION_TOKEN=your_notion_integration_token
NOTION_DATABASE_ID=your_database_id

# Server Configuration
PORT=3000
```

### 3. Set Up Notion Database

Create a Notion database with these properties:
- **Name** (Title)
- **Business** (Rich Text)
- **Email** (Email)
- **Phone** (Phone Number)
- **Caller** (Rich Text)
- **Date Added** (Date)
- **Status** (Select - with options like "New Lead", "Contacted", "Qualified")

### 4. Configure WhatsApp Business API

1. Go to Meta for Developers
2. Create a new app or use existing one
3. Add WhatsApp Business API product
4. Get your access token and phone number ID
5. Set webhook URL to: `https://yourdomain.com/webhook`
6. Set verify token (same as in .env)
7. Subscribe to `messages` webhook events

### 5. Run the Bot

```bash
npm start
```

For development:
```bash
npm run dev
```

## Usage

Cold callers should send messages in this format:

```
Name: John Smith
Business: Smith Construction
Email: john@smithconstruction.com
Phone: (555) 123-4567
```

The bot will:
1. Parse the information
2. Store it in Notion
3. Send a confirmation message

## Message Format

The bot accepts flexible formatting but looks for these keywords:
- `Name:` followed by the lead's name
- `Business:` followed by business name (optional)
- `Email:` followed by email address
- `Phone:` followed by phone number

## Error Handling

- Invalid format messages receive formatting instructions
- Failed Notion saves are logged with error details
- WhatsApp API errors are handled gracefully

## Health Check

Visit `/health` endpoint to check if the server is running.