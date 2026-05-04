import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';

interface EtherealAudioProps {
  isTriggered: boolean;
}

const EtherealAudio: React.FC<EtherealAudioProps> = ({ isTriggered }) => {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const filterRef = useRef<Tone.Filter | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Pentatonic scale for a Debussy-like ethereal feel
  const notes = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'];
  const timerRef = useRef<number | null>(null);

  const initAudio = async () => {
    if (isInitialized) return;

    await Tone.start();

    const reverb = new Tone.Reverb({
      decay: 6,
      wet: 0.6,
    }).toDestination();

    const filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 2000,
      rolloff: -24,
    }).connect(reverb);

    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.01,
        decay: 1.5,
        sustain: 0.1,
        release: 4,
      },
    }).connect(filter);

    synth.set({ volume: -26 });

    synthRef.current = synth;
    filterRef.current = filter;
    reverbRef.current = reverb;

    setIsInitialized(true);
  };

  const playRandomNote = useCallback(() => {
    if (!synthRef.current) return;

    const randomNote = notes[Math.floor(Math.random() * notes.length)];
    const velocity = 0.1 + Math.random() * 0.2;
    synthRef.current.triggerAttackRelease(randomNote, '2n', Tone.now(), velocity);

    const nextTime = 400 + Math.random() * 1200;
    timerRef.current = window.setTimeout(playRandomNote, nextTime);
  }, []);

  useEffect(() => {
    if (isTriggered && isInitialized) {
      playRandomNote();
    } else if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isTriggered, isInitialized, playRandomNote]);

  useEffect(() => {
    const handleFirstInteraction = () => {
      initAudio();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('mousemove', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('mousemove', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('mousemove', handleFirstInteraction);
    };
  }, []);

  return null;
};

export default EtherealAudio;
