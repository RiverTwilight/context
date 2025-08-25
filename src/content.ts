chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getCurrentUrl') {
    sendResponse({ url: window.location.href });
  }
  return true;
});