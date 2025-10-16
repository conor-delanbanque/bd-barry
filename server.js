const { App } = require('@slack/bolt');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

// /pipeline-summary command
app.command('/pipeline-summary', async ({ ack, respond }) => {
  await ack();

  if (!HUBSPOT_TOKEN) {
    await respond('HubSpot token not configured.');
    return;
  }

  try {
    const response = await axios.get('https://api.hubapi.com/crm/v3/objects/deals', {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
      params: {
        limit: 10,
        properties: ['dealname', 'dealstage', 'amount', 'closedate'],
      },
    });

    const deals = response.data.results;

    if (deals.length === 0) {
      await respond('No active deals found.');
      return;
    }

    let message = '*📊 Pipeline Summary*\n\n';
    deals.forEach((deal, idx) => {
      const props = deal.properties;
      message += `*${idx + 1}. ${props.dealname}*\n`;
      message += `   Stage: ${props.dealstage}\n`;
      message += `   Amount: $${props.amount || 'N/A'}\n`;
      message += `   Close Date: ${props.closedate || 'N/A'}\n\n`;
    });

    await respond(message);
  } catch (error) {
    console.error('Error fetching pipeline:', error.message);
    await respond(`❌ Error: ${error.message}`);
  }
});

// /add-note command
app.command('/add-note', async ({ ack, respond, command }) => {
  await ack();

  if (!HUBSPOT_TOKEN) {
    await respond('HubSpot token not configured.');
    return;
  }

  const parts = command.text.split(' ');
  const email = parts[0];
  const noteText = parts.slice(1).join(' ');

  if (!email || !noteText) {
    await respond('❌ Usage: `/add-note [contact-email] [note text]`');
    return;
  }

  try {
    const searchResponse = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              },
            ],
          },
        ],
        limit: 1,
      },
      {
        headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
      }
    );

    const contacts = searchResponse.data.results;
    if (contacts.length === 0) {
      await respond(`❌ Contact with email ${email} not found.`);
      return;
    }

    const contactId = contacts[0].id;

    await axios.post(
      'https://api.hubapi.com/crm/v3/objects/notes',
      {
        properties: {
          hs_note_body: noteText,
        },
        associations: [
          {
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationType: 'note_related_to_contact' }],
            id: contactId,
          },
        ],
      },
      {
        headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
      }
    );

    await respond(`✅ Note added to ${email}:\n"${noteText}"`);
  } catch (error) {
    console.error('Error adding note:', error.message);
    await respond(`❌ Error: ${error.message}`);
  }
});

// /follow-up command
app.command('/follow-up', async ({ ack, respond, command }) => {
  await ack();

  const parts = command.text.split(' ');
  const email = parts[0];
  const days = parseInt(parts[1]) || 1;

  if (!email || isNaN(days)) {
    await respond('❌ Usage: `/follow-up [contact-email] [days]`\nExample: `/follow-up john@example.com 3`');
    return;
  }

  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + days);

  await respond(
    `📅 Follow-up reminder set for ${email}\nScheduled: ${followUpDate.toDateString()}`
  );
});

// Start the app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ BD Barry is running!');
})();
