# Testing Interface (No School Counter Increment)

This backend includes a separate testing endpoint + page for creating **test** school profiles without consuming the production numeric school id counter (`metadata/school_id_counter`).

## Enable

Start the backend with:

- `ENABLE_TESTING_INTERFACE=true`

If the flag is not set, the testing endpoint returns `404 Not found`.

Optional (recommended if you want to avoid Firebase login on the test page):

- `TESTING_INTERFACE_SECRET=some_long_random_string`

When set, `POST /api/testing/schools` can be called **without** `Authorization` by sending:

- `X-Testing-Secret: some_long_random_string`

This secret is only required when calling testing endpoints **without** a Firebase `Authorization: Bearer ...` token (it will not block the normal authenticated flow).

## Use same Admin UI (no counter increment)

To use the **existing admin UI** and create schools **without** incrementing the production counter, call the normal endpoint with testing mode enabled:

- `POST /api/schools?testing=1`

or send header:

- `X-Testing-Mode: true`

When `TESTING_INTERFACE_SECRET` is set, also send:

- `X-Testing-Secret: <secret>`

In testing mode, ids are allocated from `metadata/school_id_counter_testing` and the created school document is marked with `testing=true`.

If you can’t change the frontend to send headers/query params, use cookie-based mode:

1) Open `/media/testing-mode.html`
2) Click “Enable testing mode” (calls `/api/testing-mode/on` and sets cookie `schools_test_mode=1`)
3) Use the normal admin UI

## Use

- Test page: `/media/testing-school.html`
- Toggle page: `/media/testing-mode.html`
- API: `POST /api/testing/schools`

The test school is stored in Firestore collection `schools_testing` and the default cover status is stored in `cover_selections_testing`.

## Authorization (easy way)

The test page includes a **Firebase login (Google redirect flow)**. After login it automatically fetches an ID token and fills:

- `Authorization: Bearer <token>`

If Firebase shows an `unauthorized domain` error, add your dev host (for example `localhost`) in:

- Firebase Console → Authentication → Settings → Authorized domains

If login is blocked with CSP errors for `apis.google.com`, the backend now relaxes CSP **only for** `/media/testing-school.html` when `ENABLE_TESTING_INTERFACE=true`.
