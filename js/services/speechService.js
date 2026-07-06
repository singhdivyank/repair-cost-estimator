// Reads a cached AI report aloud using the built-in SpeechSynthesis API.
// No network, no additional model call — just narrates the structured data
// that's already been generated and saved.

let currentUtterance = null;

function reportToSpeechText(report) {
  const parts = [report.executiveSummary];
  if (report.recommendations?.length) {
    parts.push('Top recommendations.');
    report.recommendations.forEach((r, i) => parts.push(`${i + 1}. ${r.title}. ${r.reasoning}`));
  }
  if (report.risks?.length) {
    parts.push('Risks to watch.');
    report.risks.forEach((r) => parts.push(r));
  }
  return parts.join(' ');
}

export const speechService = {
  isSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },

  isSpeaking() {
    return this.isSupported() && window.speechSynthesis.speaking;
  },

  speakReport(report, { onEnd } = {}) {
    if (!this.isSupported()) return false;
    this.stop();
    const utterance = new SpeechSynthesisUtterance(reportToSpeechText(report));
    utterance.rate = 1.0;
    utterance.onend = () => onEnd?.();
    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  },

  stop() {
    if (this.isSupported()) window.speechSynthesis.cancel();
    currentUtterance = null;
  },
};