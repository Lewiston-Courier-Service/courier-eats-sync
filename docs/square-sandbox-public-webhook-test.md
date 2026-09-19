# Square Sandbox public webhook test

This is a deliberately isolated public Worker used only to prove that Square
Sandbox can deliver a signed webhook to Courier Eats.

It has:
- no D1 binding
- no R2 binding
- no production routes or custom domains
- no production Square token
- one webhook endpoint: /api/webhooks/square-sandbox
- one health endpoint: /health

Deploy with:

    npx wrangler deploy --config wrangler.square-webhook-test.jsonc

After deployment, use the returned workers.dev hostname and append:

    /api/webhooks/square-sandbox

Create a Square Sandbox webhook subscription for that HTTPS URL and event types:
payment.created
payment.updated

Then store that subscription's signature key as a Worker secret:

    npx wrangler secret put SQUARE_WEBHOOK_TEST_SIGNATURE_KEY --config wrangler.square-webhook-test.jsonc

If Square is configured with an exact notification URL that differs from the
incoming request URL for any reason, also set:

    npx wrangler secret put SQUARE_WEBHOOK_TEST_NOTIFICATION_URL --config wrangler.square-webhook-test.jsonc

The test is successful when Square's webhook log shows HTTP 2xx and the Worker
returns JSON with received=true, signatureValid=true, and squareEnvironment=Sandbox.
