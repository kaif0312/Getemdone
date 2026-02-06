// Sound utility for task completion
export const playSuccessSound = () => {
  if (typeof window === 'undefined') return;
  
  try {
    // Create AudioContext
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();
    
    // Create a simple pleasant "ding" sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Pleasant C major chord frequencies
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
    
    frequencies.forEach((freq, index) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.frequency.value = freq;
      osc.type = 'sine';
      
      // Envelope
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      osc.start(audioContext.currentTime + index * 0.05);
      osc.stop(audioContext.currentTime + 0.3 + index * 0.05);
    });
  } catch (error) {
    // Silently fail if audio isn't supported
    console.debug('Audio not supported:', error);
  }
};

export const playSound = (enabled: boolean = true) => {
  if (!enabled) return;
  playSuccessSound();
};
