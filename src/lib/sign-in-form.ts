// What the sign-in form keeps between submissions (see requestSignInLink).
export type SignInFormState = {
  // The address as typed, so the field keeps it.
  email?: string;
  // Under the field: the address is not an email.
  fieldError?: string;
  // Under the button: too many emails, or the email could not be sent.
  formError?: string;
  // The email went out to this address, as the server keeps it.
  sentTo?: string;
};
