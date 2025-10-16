const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config();

const app = express();
app.use(express.json());

// Environment variables
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const REDIRECT_URL = process.env.REDIRECT_URL;
const PORT = process.env.PORT || 3000;

// In-memory store for tokens (use a database in production)
const tokenStore = new Map();

// Slack request verification middleware
const verifySlackRequest = (req, res, next) => {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];

  if (!timestamp || !signature) {
    return res.status(400).send('Missing timestamp or signature');
  }

  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - timestamp) > 300) {
    return res.status(400).send('Request timestamp out of range');
  }

  const baseString = `v0:${timestamp}:${JSON.stringify(req.body)}`;
  const computedSig = `v0=${crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(baseString)
    .digest('hex')}`;

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSig))) {
    return res.status(401).send('Invalid signature');
  }

  next();
};

// OAuth2.0 redirect handler
app.get('/slack/oauth_redirect', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${REDIRECT_URL}/slack/oauth_redirect`,
      },
    });

    if (!response.data.ok) {
      return res.status(400).send(`OAuth failed: ${response.data.error}`);
    }

    const { team_id, access_token, user_id } = response.data;
    tokenStore.set(team_id, access_token);

    res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>✅ BD Barry installed successfully!</h1>
          <p>You can now use the bot in your Slack workspace.</p>
          <p>Try these commands:</p>
          <ul>
            <li><code>/pipeline-summary</code> - Get a summary of active deals</li>
            <li><code>/add-note [contact-email] [note text]</code> - Add a note to a contact</li>
            <li><code>/follow-up [contact-email] [days]</code> - Set a follow-up reminder</li>
          </ul>
          <p>Close this window and go back to Slack.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth error:', error.message);
    res.status(500).send(`OAuth error: ${error.message}`);
  }
});

// All Slack interactions go through /slack/events
app.post('/slack/events', verifySlackRequest, async (req, res) => {
  const { type, challenge, command, text, team_id, user_id, channel_id, response_url } = req.body;

  // Slack URL verification
  if (type === 'url_verification') {
    console.log('Slack verification received');
    return res.status(200).json({ challenge });
  }

  // Handle slash commands
  if (type === 'command' || command) {
    console.log('Slash command received:', command);
    const token = tokenStore.get(team_id);

    console.log('Team ID:', team_id, 'Token exists:', !!token);

    if (!token) {
      console.log('No token found for team:', team_id);
      return res.status(403).json({ error: 'Bot not installed for this workspace' });
    }

    res.status(200).json({ ok: true });

  try {
    if (command === '/pipeline-summary') {
      await handlePipelineSummary(response_url, team_id, user_id);
    } else if (command === '/add-note') {
      await handleAddNote(response_url, text, team_id);
    } else if (command === '/follow-up') {
      await handleFollowUp(response_url, text, team_id, user_id);
    }
  } catch (error) {
    console.error(`Error handling ${command}:`, error.message);
    await sendSlackMessage(response_url, `❌ Error: ${error.message}`);
  }
});

// Handler: /pipeline-summary
async function handlePipelineSummary(responseUrl, teamId, userId) {
  if (!HUBSPOT_TOKEN) {
    await sendSlackMessage(
      responseUrl,
      'HubSpot token not configured. Contact your admin to set HUBSPOT_TOKEN.'
    );
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
      await sendSlackMessage(responseUrl, 'No active deals found.');
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

    await sendSlackMessage(responseUrl, message);
  } catch (error) {
    throw new Error(`Failed to fetch pipeline: ${error.message}`);
  }
}

// Handler: /add-note
async function handleAddNote(responseUrl, text, teamId) {
  if (!HUBSPOT_TOKEN) {
    await sendSlackMessage(
      responseUrl,
      'HubSpot token not configured. Contact your admin.'
    );
    return;
  }

  const parts = text.split(' ');
  const email = parts[0];
  const noteText = parts.slice(1).join(' ');

  if (!email || !noteText) {
    await sendSlackMessage(
      responseUrl,
      '❌ Usage: `/add-note [contact-email] [note text]`'
    );
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
      await sendSlackMessage(responseUrl, `❌ Contact with email ${email} not found.`);
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

    await sendSlackMessage(
      responseUrl,
      `✅ Note added to ${email}:\n"${noteText}"`
    );
  } catch (error) {
    throw new Error(`Failed to add note: ${error.message}`);
  }
}

// Handler: /follow-up
async function handleFollowUp(responseUrl, text, teamId, userId) {
  const parts = text.split(' ');
  const email = parts[0];
  const days = parseInt(parts[1]) || 1;

  if (!email || isNaN(days)) {
    await sendSlackMessage(
      responseUrl,
      '❌ Usage: `/follow-up [contact-email] [days]`\nExample: `/follow-up john@example.com 3`'
    );
    return;
  }

  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + days);

  await sendSlackMessage(
    responseUrl,
    `📅 Follow-up reminder set for ${email}\nScheduled: ${followUpDate.toDateString()}\n\n_Note: In production, this would trigger an automated reminder._`
  );
}

// Helper: Send message to Slack response URL
async function sendSlackMessage(responseUrl, text) {
  await axios.post(responseUrl, {
    response_type: 'in_channel',
    text,
  });
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Debug endpoint - test if Slack can reach us
app.post('/slack/commands/test', (req, res) => {
  console.log('TEST endpoint hit');
  console.log('Body:', req.body);
  res.status(200).json({ ok: true, message: 'Test received' });
});

// Start server
app.listen(PORT, () => {
  console.log(`BD Barry running on port ${PORT}`);
  console.log(`OAuth redirect: ${REDIRECT_URL}/slack/oauth_redirect`);
});
