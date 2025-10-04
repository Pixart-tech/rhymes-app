const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

const getHeaderValue = (headers, key) => {
  if (!headers) {
    return '';
  }

  const normalizedKey = key.toLowerCase();

  if (typeof headers.get === 'function') {
    return headers.get(normalizedKey) || headers.get(key) || '';
  }

  if (typeof headers === 'object') {
    if (normalizedKey in headers) {
      return headers[normalizedKey];
    }

    if (key in headers) {
      return headers[key];
    }

    const matching = Object.entries(headers).find(([headerKey]) => headerKey.toLowerCase() === normalizedKey);
    if (matching) {
      return matching[1];
    }
  }

  return '';
};

const parseCharset = (headers) => {
  const contentType = getHeaderValue(headers, 'content-type');

  if (typeof contentType !== 'string') {
    return 'utf-8';
  }

  const match = contentType.match(/charset=([^;]+)/i);
  if (match && match[1]) {
    return match[1].trim().toLowerCase();
  }

  return 'utf-8';
};

const decodeBinaryPayload = (payload, headers) => {
  if (!(payload instanceof ArrayBuffer) && !ArrayBuffer.isView(payload)) {
    return '';
  }

  const encoding = parseCharset(headers);
  const buffer = payload instanceof ArrayBuffer ? payload : payload.buffer;

  if (!buffer) {
    return '';
  }

  if (typeof TextDecoder !== 'undefined') {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false, ignoreBOM: true });
      const view = payload instanceof ArrayBuffer ? new Uint8Array(payload) : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
      return decoder.decode(view);
    } catch (error) {
      console.warn('Failed to decode SVG payload using TextDecoder:', error);
    }
  }

  try {
    const view = payload instanceof ArrayBuffer ? new Uint8Array(payload) : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    const chunkSize = 0x8000;
    let result = '';

    for (let index = 0; index < view.length; index += chunkSize) {
      const slice = view.subarray(index, index + chunkSize);
      result += String.fromCharCode.apply(null, slice);
    }

    try {
      return decodeURIComponent(escape(result));
    } catch (error) {
      return result;
    }
  } catch (error) {
    console.error('Unable to decode binary SVG payload:', error);
    return '';
  }
};

const decodeBase64 = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '';
  }

  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(',');
  const base64Data = trimmed.startsWith('data:') && commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;

  const decodeUsingAtob = (input) => {
    try {
      if (typeof atob === 'function') {
        return atob(input);
      }
    } catch (error) {
      console.warn('Unable to decode base64 using atob:', error);
    }
    return null;
  };

  const decodeUsingBuffer = (input) => {
    try {
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(input, 'base64').toString('utf-8');
      }
    } catch (error) {
      console.warn('Unable to decode base64 using Buffer:', error);
    }
    return null;
  };

  const decodedViaAtob = decodeUsingAtob(base64Data);
  if (decodedViaAtob !== null) {
    try {
      return decodeURIComponent(escape(decodedViaAtob));
    } catch (error) {
      return decodedViaAtob;
    }
  }

  const decodedViaBuffer = decodeUsingBuffer(base64Data);
  if (decodedViaBuffer !== null) {
    return decodedViaBuffer;
  }

  return '';
};

const isLikelyBase64Svg = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();

  if (trimmed.startsWith('data:image/svg+xml;base64,')) {
    return true;
  }

  if (trimmed.includes('<')) {
    return false;
  }

  if (trimmed.length % 4 !== 0) {
    return false;
  }

  return /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
};

export const decodeSvgPayload = (payload, headers) => {
  if (payload == null) {
    return '';
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim();

    if (!trimmed) {
      return '';
    }

    if (trimmed.startsWith('data:image/svg+xml;base64,')) {
      return decodeBase64(trimmed);
    }

    if (isLikelyBase64Svg(trimmed)) {
      const decoded = decodeBase64(trimmed);
      if (decoded.trim().startsWith('<')) {
        return decoded;
      }
    }

    return trimmed;
  }

  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
    return decodeBinaryPayload(payload, headers);
  }

  if (typeof payload === 'object') {
    if (payload.data !== undefined) {
      return decodeSvgPayload(payload.data, headers);
    }

    if (payload.body !== undefined) {
      return decodeSvgPayload(payload.body, headers);
    }
  }

  return '';
};

const ensureNamespaceAttributes = (svgElement) => {
  if (!svgElement.getAttribute('xmlns')) {
    svgElement.setAttribute('xmlns', SVG_NAMESPACE);
  }

  if (!svgElement.getAttribute('xmlns:xlink')) {
    svgElement.setAttribute('xmlns:xlink', XLINK_NAMESPACE);
  }

  svgElement.setAttribute('xml:space', 'preserve');
  svgElement.setAttribute('focusable', 'false');
};

const removeSizeAttributes = (svgElement) => {
  const widthAttr = svgElement.getAttribute('width');
  const heightAttr = svgElement.getAttribute('height');
  const widthValue = Number.parseFloat(widthAttr ?? '');
  const heightValue = Number.parseFloat(heightAttr ?? '');

  if (widthAttr) {
    svgElement.removeAttribute('width');
  }

  if (heightAttr) {
    svgElement.removeAttribute('height');
  }

  const inlineStyleAttr = svgElement.getAttribute('style');
  if (typeof inlineStyleAttr === 'string' && inlineStyleAttr.trim().length > 0) {
    const filteredStyleRules = inlineStyleAttr
      .split(';')
      .map((rule) => rule.trim())
      .filter((rule) => rule.length > 0 && !/^width\s*:/i.test(rule) && !/^height\s*:/i.test(rule));

    if (filteredStyleRules.length > 0) {
      svgElement.setAttribute('style', `${filteredStyleRules.join('; ')};`);
    } else {
      svgElement.removeAttribute('style');
    }
  }

  return { widthValue, heightValue };
};

const ensureRectanglesCoverCanvas = (svgElement, referenceWidth, referenceHeight) => {
  const rectElements = svgElement.querySelectorAll('rect');

  rectElements.forEach((rect) => {
    const rectWidthAttr = rect.getAttribute('width');
    const rectHeightAttr = rect.getAttribute('height');
    const rectXAttr = rect.getAttribute('x');
    const rectYAttr = rect.getAttribute('y');

    const rectWidthValue = Number.parseFloat(rectWidthAttr ?? '');
    const rectHeightValue = Number.parseFloat(rectHeightAttr ?? '');
    const rectXValue = Number.parseFloat(rectXAttr ?? '');
    const rectYValue = Number.parseFloat(rectYAttr ?? '');

    const widthLooksLikeCanvas =
      Number.isFinite(referenceWidth) &&
      Number.isFinite(rectWidthValue) &&
      Math.abs(rectWidthValue - referenceWidth) < 1;

    const heightLooksLikeCanvas =
      Number.isFinite(referenceHeight) &&
      Number.isFinite(rectHeightValue) &&
      Math.abs(rectHeightValue - referenceHeight) < 1;

    const shouldStretchWidth =
      !rectWidthAttr ||
      /%/i.test(rectWidthAttr) ||
      !Number.isFinite(rectWidthValue) ||
      widthLooksLikeCanvas;

    const shouldStretchHeight =
      !rectHeightAttr ||
      /%/i.test(rectHeightAttr) ||
      !Number.isFinite(rectHeightValue) ||
      heightLooksLikeCanvas;

    if (shouldStretchWidth) {
      rect.setAttribute('width', '100%');
    }

    if (shouldStretchHeight) {
      rect.setAttribute('height', '100%');
    }

    if (shouldStretchWidth && (!rectXAttr || !Number.isFinite(rectXValue) || Math.abs(rectXValue) < 0.5)) {
      rect.setAttribute('x', '0');
    }

    if (shouldStretchHeight && (!rectYAttr || !Number.isFinite(rectYValue) || Math.abs(rectYValue) < 0.5)) {
      rect.setAttribute('y', '0');
    }
  });
};

const parseViewBox = (svgElement) => {
  const viewBoxAttr = svgElement.getAttribute('viewBox');

  if (!viewBoxAttr || viewBoxAttr.trim().length === 0) {
    return null;
  }

  const parts = viewBoxAttr
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part))
    .filter((part) => Number.isFinite(part));

  if (parts.length < 4) {
    return null;
  }

  const sanitized = parts.slice(0, 4);
  svgElement.setAttribute('viewBox', sanitized.map((value) => `${value}`).join(' '));

  return {
    x: sanitized[0],
    y: sanitized[1],
    width: sanitized[2],
    height: sanitized[3]
  };
};

const ensureClipAndMaskUnits = (svgElement) => {
  svgElement.querySelectorAll('clipPath').forEach((node) => {
    if (!node.getAttribute('clipPathUnits')) {
      node.setAttribute('clipPathUnits', 'userSpaceOnUse');
    }
  });

  svgElement.querySelectorAll('mask').forEach((node) => {
    if (!node.getAttribute('maskUnits')) {
      // The SVG specification defaults maskUnits to "objectBoundingBox". Respecting this default
      // keeps artwork that relies on bounding box relative masks (for example polygon-based bodies)
      // from being clipped away when we normalise markup.
      node.setAttribute('maskUnits', 'objectBoundingBox');
    }

    if (!node.getAttribute('maskContentUnits')) {
      node.setAttribute('maskContentUnits', 'userSpaceOnUse');
    }
  });
};

const computeBoundingBox = (svgElement) => {
  if (typeof document === 'undefined' || !document.body || typeof svgElement.cloneNode !== 'function') {
    return null;
  }

  let tempContainer;
  let bbox = null;

  try {
    const clone = svgElement.cloneNode(true);
    clone.setAttribute('width', '0');
    clone.setAttribute('height', '0');
    clone.style.position = 'absolute';
    clone.style.opacity = '0';
    clone.style.pointerEvents = 'none';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.width = '0';
    clone.style.height = '0';
    clone.setAttribute('overflow', 'visible');

    tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.opacity = '0';
    tempContainer.style.pointerEvents = 'none';
    tempContainer.style.top = '-9999px';
    tempContainer.style.left = '-9999px';
    tempContainer.style.width = '0';
    tempContainer.style.height = '0';

    tempContainer.appendChild(clone);
    document.body.appendChild(tempContainer);

    if (typeof clone.getBBox === 'function') {
      const candidate = clone.getBBox();
      if (
        candidate &&
        Number.isFinite(candidate.x) &&
        Number.isFinite(candidate.y) &&
        Number.isFinite(candidate.width) &&
        Number.isFinite(candidate.height)
      ) {
        bbox = candidate;
      }
    }
  } catch (error) {
    console.warn('Unable to compute SVG bounding box for normalisation:', error);
  } finally {
    if (tempContainer && tempContainer.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer);
    }
  }

  return bbox;
};

const removeRhymeCodeText = (svgElement, rhymeCode) => {
  const normalizedCode = (rhymeCode ?? '').toString().trim();
  const normalizedCodeLower = normalizedCode.toLowerCase();
  const normalizedCodeCompact = normalizedCodeLower.replace(/[^a-z0-9]/g, '');
  const textNodes = svgElement.querySelectorAll('text, tspan');

  textNodes.forEach((node) => {
    const rawText = (node.textContent ?? '').toString();
    const normalizedText = rawText.trim().toLowerCase();

    if (!normalizedText) {
      return;
    }

    const normalizedCompact = normalizedText.replace(/[^a-z0-9]/g, '');
    const hasCodeReference = Boolean(
      (normalizedCodeLower && normalizedText.includes(normalizedCodeLower)) ||
      (normalizedCodeCompact && normalizedCompact.includes(normalizedCodeCompact))
    );
    const hasLabel = normalizedText.includes('rhyme code') || normalizedText.includes('code:');

    if (hasCodeReference || hasLabel) {
      if (typeof node.closest === 'function') {
        const parentText = node.closest('text');
        if (parentText) {
          parentText.remove();
          return;
        }
      }
      node.remove();
    }
  });
};

export const sanitizeRhymeSvgContent = (svgContent, rhymeCode) => {
  if (!svgContent || typeof svgContent !== 'string') {
    return svgContent;
  }

  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return svgContent;
  }

  try {
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');

    let svgElement = doc.documentElement;
    if (!svgElement || svgElement.tagName?.toLowerCase() !== 'svg') {
      svgElement = doc.querySelector('svg');
    }

    if (!svgElement) {
      return svgContent;
    }

    if (svgElement.tagName?.toLowerCase() === 'parsererror') {
      return svgContent;
    }

    ensureNamespaceAttributes(svgElement);

    const { widthValue, heightValue } = removeSizeAttributes(svgElement);

    const parsedViewBox = parseViewBox(svgElement);
    const referenceWidth = Number.isFinite(parsedViewBox?.width) ? parsedViewBox.width : widthValue;
    const referenceHeight = Number.isFinite(parsedViewBox?.height) ? parsedViewBox.height : heightValue;

    ensureRectanglesCoverCanvas(svgElement, referenceWidth, referenceHeight);
    ensureClipAndMaskUnits(svgElement);

    let viewBox = parsedViewBox;

    if (!viewBox || !Number.isFinite(viewBox.width) || !Number.isFinite(viewBox.height) || viewBox.width <= 1 || viewBox.height <= 1) {
      if (Number.isFinite(widthValue) && Number.isFinite(heightValue) && widthValue > 0 && heightValue > 0) {
        svgElement.setAttribute('viewBox', `0 0 ${widthValue} ${heightValue}`);
        viewBox = { x: 0, y: 0, width: widthValue, height: heightValue };
      }
    }

    if (!viewBox || viewBox.width <= 1 || viewBox.height <= 1) {
      const bbox = computeBoundingBox(svgElement);
      if (bbox && bbox.width > 0 && bbox.height > 0) {
        svgElement.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
        viewBox = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
      }
    }

    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgElement.setAttribute('overflow', 'visible');

    removeRhymeCodeText(svgElement, rhymeCode);

    if (typeof window.XMLSerializer === 'undefined') {
      return svgElement.outerHTML;
    }

    const serializer = new window.XMLSerializer();
    return serializer.serializeToString(svgElement);
  } catch (error) {
    console.error('Error sanitizing rhyme SVG:', error);
    return svgContent;
  }
};

export const prepareSvgContent = (payload, headers, rhymeCode) => {
  const decoded = decodeSvgPayload(payload, headers);
  if (!decoded) {
    return '';
  }
  return sanitizeRhymeSvgContent(decoded, rhymeCode);
};
