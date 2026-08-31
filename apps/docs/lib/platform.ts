// The notify form is for Windows, not for "not a Mac": someone on Linux or a
// phone is offered the download, which is what they came for and what a link
// they pass on has to keep doing.
export const onWindows = (userAgent: string) => /Windows NT/i.test(userAgent);
