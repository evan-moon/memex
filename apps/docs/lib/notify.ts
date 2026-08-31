// Where a Windows visitor's address goes. Set it to a Formspree form
// (https://formspree.io/f/<id>) and the hero asks for an email; leave it unset
// and the hero points at GitHub releases instead, which is the honest offer
// when there is nowhere to put the address.
export const NOTIFY_ENDPOINT = process.env.NEXT_PUBLIC_NOTIFY_ENDPOINT ?? null;
