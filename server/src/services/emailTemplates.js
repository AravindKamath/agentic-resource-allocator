import { REQUEST_STATUS_LABELS } from '../domain/resourceCatalog.js';
import { config } from '../config.js';

const escapeHtml = (value) => String(value ?? 'Not specified')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const display = value => value === undefined || value === null || value === '' ? 'Not specified' : String(value);
const titleCase = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const reference = request => `IT-${String(request._id).slice(-8).toUpperCase()}`;

function rows(entries) {
  return entries.map(([key, value]) => `<tr><th style="text-align:left;padding:8px;border:1px solid #d9e1ea;background:#f6f8fb;font-weight:600">${escapeHtml(key)}</th><td style="padding:8px;border:1px solid #d9e1ea">${escapeHtml(display(value))}</td></tr>`).join('');
}

function textRows(entries) {
  return entries.map(([key, value]) => `${key}: ${display(value)}`).join('\n');
}

function safeLogoUrl() {
  try {
    const url = new URL(config.organization.logoUrl);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function layout(title, intro, sections) {
  const logo = safeLogoUrl();
  const brand = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(config.organization.name)}" style="display:block;max-height:44px;max-width:220px;margin-bottom:22px">`
    : `<div style="font-size:18px;font-weight:700;color:#17324d;margin-bottom:22px">${escapeHtml(config.organization.name)}</div>`;
  const support = config.organization.supportEmail
    ? `Need assistance? Contact the IT support team at ${config.organization.supportEmail}.`
    : 'Need assistance? Contact the IT support team through your usual support channel.';
  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#243447">
    <div style="max-width:640px;margin:24px auto;background:#fff;padding:28px">
      ${brand}
      <h1 style="font-size:22px;margin:0 0 18px;color:#17324d">${escapeHtml(title)}</h1>
      <p style="line-height:1.5">${escapeHtml(intro)}</p>
      ${sections.map(s => `<h2 style="font-size:16px;margin:24px 0 8px;color:#17324d">${escapeHtml(s.heading)}</h2>${s.html}`).join('')}
      <p style="margin-top:28px;line-height:1.5">${escapeHtml(support)}</p>
      <p style="margin-top:18px;line-height:1.5">Regards,<br>${escapeHtml(config.organization.name)}</p>
    </div></body></html>`;
  const text = [config.organization.name, title, '', intro, '', ...sections.flatMap(s => [s.heading, s.text, '']), support, '', 'Regards,', config.organization.name].join('\n');
  return { html, text };
}

function requirementEntries(request) {
  return [
    ['Reference', reference(request)], ['Request', request.title],
    ['Category', request.category === 'other' ? 'Other / to be matched by requirements' : titleCase(request.category)],
    ['Purpose', request.purpose],
    ['Quantity', request.quantity],
    ...Object.entries(request.specifications || {}).map(([key, value]) => [titleCase(key), value]),
    ['Needed by', request.neededBy ? new Date(request.neededBy).toLocaleDateString() : null]
  ];
}

export function requestReceivedTemplate(request) {
  const entries = requirementEntries(request);
  return {
    subject: 'IT Resource Request Received',
    ...layout('IT Resource Request Received', 'We received your request and it is now under review.', [{
      heading: 'Request summary', html: `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows(entries)}</table>`, text: textRows(entries)
    }, {
      heading: 'Next steps', html: '<p style="line-height:1.5">IT will review the requirements and contact you if more information is needed. We will send another update when the request progresses.</p>', text: 'IT will review the requirements and contact you if more information is needed. We will send another update when the request progresses.'
    }])
  };
}

export function assignmentConfirmedTemplate(request, asset) {
  const entries = [
    ['Reference', reference(request)], ['Category', titleCase(asset?.category)],
    ['Asset', asset?.name], ['CPU cores', asset?.specs?.cpuCores],
    ['RAM (GB)', asset?.specs?.memoryGb], ['Storage (GB)', asset?.specs?.storageGb],
    ['Storage type', asset?.specs?.storageType], ['GPU', asset?.specs?.gpuModel || (asset?.specs?.gpuCount ? `${asset.specs.gpuCount} GPU(s)` : null)],
    ['Operating system', asset?.operatingSystem || asset?.specs?.operatingSystem],
    ['Status', REQUEST_STATUS_LABELS[request.status] || request.status]
  ];
  return {
    subject: 'IT Resource Request - Assignment Confirmed',
    ...layout('Assignment confirmed', 'Your IT resource request has been assigned.', [{
      heading: 'Assigned resource', html: `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows(entries)}</table>`, text: textRows(entries)
    }, {
      heading: 'Collection and usage', html: '<p style="line-height:1.5">Please follow the collection or usage instructions provided by IT. Contact IT if the resource does not meet the confirmed requirements.</p>', text: 'Please follow the collection or usage instructions provided by IT. Contact IT if the resource does not meet the confirmed requirements.'
    }])
  };
}

export function requestRejectedTemplate(request) {
  const reason = request.rejection?.reason || 'The request could not be approved at this time.';
  return {
    subject: 'IT Resource Request – Update',
    ...layout('Request update', 'After review, your IT resource request was rejected.', [{
      heading: 'Decision', html: `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows([['Reference', reference(request)], ['Status', 'Rejected'], ['Reason', reason]])}</table>`, text: textRows([['Reference', reference(request)], ['Status', 'Rejected'], ['Reason', reason]])
    }, {
      heading: 'Next steps', html: '<p style="line-height:1.5">Contact IT if you need clarification, or submit a revised request with updated requirements.</p>', text: 'Contact IT if you need clarification, or submit a revised request with updated requirements.'
    }])
  };
}

export function manualReviewTemplate(request) {
  const unresolved = request.automation?.reason || request.pendingClarification?.message || 'The request needs administrator review.';
  const entries = [['Reference', reference(request)], ['Status', REQUEST_STATUS_LABELS[request.status] || request.status], ['Category', titleCase(request.category)], ['Purpose', request.purpose], ['Unresolved information', unresolved]];
  return {
    subject: 'IT Resource Request – Manual Review Needed',
    ...layout('Manual review needed', 'Your request needs further review before a resource can be assigned.', [{
      heading: 'Known requirements', html: `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows(entries)}</table>`, text: textRows(entries)
    }, {
      heading: 'Next steps', html: '<p style="line-height:1.5">No resource has been assigned. IT will contact you if clarification is required.</p>', text: 'No resource has been assigned. IT will contact you if clarification is required.'
    }])
  };
}

export function adminManualReviewTemplate(request, applicationUrl) {
  const entries = [['Reference', reference(request)], ['Status', REQUEST_STATUS_LABELS[request.status] || request.status], ['Requester', request.requester?.name], ['Purpose', request.purpose], ['Reason', request.automation?.reason || request.pendingClarification?.message]];
  const link = applicationUrl ? `<p><a href="${escapeHtml(applicationUrl)}">Open the request in the admin application</a></p>` : '';
  return {
    subject: `IT resource request ${reference(request)} needs review`,
    ...layout('Request requires manual review', 'A resource request needs an administrator decision.', [{
      heading: 'Request summary', html: `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows(entries)}</table>${link}`, text: `${textRows(entries)}${applicationUrl ? `\nApplication: ${applicationUrl}` : ''}`
    }])
  };
}

export { escapeHtml };
