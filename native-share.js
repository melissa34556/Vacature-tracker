import { Capacitor, registerPlugin } from '@capacitor/core';
import { CapacitorShareTarget } from '@capgo/capacitor-share-target';

function findUrl(texts) {
  for (const text of texts || []) {
    const match = String(text).match(/https?:\/\/[^\s<>"']+/i);
    if (match) return match[0].replace(/[),.;]+$/, '');
  }
  return '';
}

async function sharedFileToFile(sharedFile) {
  const uri = sharedFile?.uri;
  if (!uri) return null;
  const candidates = [uri];
  if (!/^(https?:|data:|blob:)/i.test(uri)) {
    try { candidates.push(Capacitor.convertFileSrc(uri)); } catch {}
  }
  let lastError;
  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) throw new Error(`Bestand ophalen mislukt (${response.status})`);
      const blob = await response.blob();
      return new File([blob], sharedFile.name || 'gedeeld-bestand', {
        type: sharedFile.mimeType || blob.type || 'application/octet-stream'
      });
    } catch (error) { lastError = error; }
  }
  console.warn('Gedeeld bestand kon niet worden geopend:', lastError);
  return null;
}

async function handleShare(event) {
  const texts = (event?.texts || []).filter(Boolean).map(String);
  const files = [];
  for (const sharedFile of event?.files || []) {
    const file = await sharedFileToFile(sharedFile);
    if (file) files.push(file);
  }
  const text = texts.join('\n\n');
  const url = findUrl(texts);
  if (typeof window.receiveSharedItem !== 'function') {
    console.error('Deelinhoud ontvangen voordat de app klaar is.');
    return;
  }
  await window.receiveSharedItem({
    title: event?.title || '',
    text,
    url,
    files
  });
}

if (Capacitor.isNativePlatform()) {
  CapacitorShareTarget.addListener('shareReceived', event => {
    handleShare(event).catch(error => console.error('Verwerken van gedeelde inhoud mislukt:', error));
  });
}
