import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Menu, Play, Settings, RotateCcw, Clock, 
  ChevronLeft, ChevronRight, Check, X, Trophy, Activity, 
  AlertCircle, Music, BarChart3, Pause,
  Loader2, Piano, RefreshCw, Sliders, History, BookOpen, Layout, ArrowRight,
  Guitar, Plus, Folder, Globe, HelpCircle, Shield
} from 'lucide-react';

// --- 1. 核心常量数据 (Constants) ---

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ALL_INTERVALS = [
  { id: 'm2', name: '小二度', semitones: 1 },
  { id: 'M2', name: '大二度', semitones: 2 },
  { id: 'm3', name: '小三度', semitones: 3 },
  { id: 'M3', name: '大三度', semitones: 4 },
  { id: 'P4', name: '纯四度', semitones: 5 },
  { id: 'TT', name: '三全音', semitones: 6 },
  { id: 'P5', name: '纯五度', semitones: 7 },
  { id: 'm6', name: '小六度', semitones: 8 },
  { id: 'M6', name: '大六度', semitones: 9 },
  { id: 'm7', name: '小七度', semitones: 10 },
  { id: 'M7', name: '大七度', semitones: 11 },
  { id: 'P8', name: '纯八度', semitones: 12 },
];

const INSTRUMENTS = {
  piano: { name: 'Piano', id: 'acoustic_grand_piano', path: '/audio/acoustic_grand_piano-mp3' }, // Updated path
  guitar: { name: 'Guitar', id: 'acoustic_guitar_nylon', path: '/audio/acoustic_guitar_nylon-mp3' }, // Assuming similar path structure
  ukulele: { name: 'Ukulele', id: 'acoustic_guitar_steel', path: '/audio/acoustic_guitar_steel-mp3' }, // Assuming similar path structure
};

// --- 2. 音频引擎 (Audio Engine) ---
const AudioEngine = {
  ctx: null,
  gainNode: null,
  buffers: {},
  loaded: false,
  loadingPromise: null,
  currentInstrument: 'piano',
  onStateChangeCallback: null, // Callback for UI updates on state change

  // Updated midiToNoteName to match likely file naming (e.g., "A4.mp3")
  midiToNoteName(midi) {
    const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = notes[midi % 12];
    return `${note}${octave}`;
  },

  async init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
      this.gainNode.gain.value = 0.8;

      // Listen for state changes
      this.ctx.onstatechange = () => {
          console.log(`AudioContext state changed to: ${this.ctx.state}`);
          if (this.onStateChangeCallback) {
              this.onStateChangeCallback(this.ctx.state);
          }
          // Re-init if closed unexpectedly (preemption)
          if (this.ctx.state === 'closed') {
              console.warn("AudioContext closed unexpectedly. Re-initializing...");
              this.ctx = null; // Clear old context
              this.init(); // Re-init
          }
      };
    }

    if (this.ctx.state === 'suspended') {
      try {
          await this.ctx.resume();
      } catch (e) {
          console.warn("Failed to resume AudioContext on init:", e);
      }
    }

    if ((!this.buffers['piano'] || Object.keys(this.buffers['piano']).length === 0) && !this.loadingPromise) {
        this.loadingPromise = this.loadSamples('piano');
    }
    return this.loadingPromise;
  },
  
  // Helper to register UI callback
  setOnStateChange(callback) {
      this.onStateChangeCallback = callback;
  },

  async loadSamples(instrumentId = 'piano') {
    this.currentInstrument = instrumentId;
    // Load more keys for better quality if local, or stick to these for efficiency
    const baseMidis = [36, 48, 60, 72, 84]; 
    const instPath = INSTRUMENTS[instrumentId].path; // Use local path

    console.log(`Loading samples for ${instrumentId} from ${instPath}...`);

    if (!this.buffers[instrumentId]) {
        this.buffers[instrumentId] = {};
    }

    const promises = baseMidis.map(async (midi) => {
      if (this.buffers[instrumentId][midi]) return;

      const noteName = this.midiToNoteName(midi);
      // Construct local URL. Assuming files are named like "C4.mp3" inside the folder
      const url = `${instPath}/${noteName}.mp3`; 

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network response was not ok for ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        if (this.ctx) {
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.buffers[instrumentId][midi] = audioBuffer;
        }
      } catch (e) {
        console.warn(`Failed to load sample for ${midi} (${instrumentId}) from ${url}`, e);
      }
    });

    await Promise.all(promises);
    this.loaded = true;
  },

  getBestSample(midi, instrumentId) {
    const instBuffers = this.buffers[instrumentId];
    if (!instBuffers) return null;

    const availableMidis = Object.keys(instBuffers).map(Number).sort((a, b) => a - b);
    if (availableMidis.length === 0) return null;

    let closest = availableMidis[0];
    let minDiff = Math.abs(midi - closest);

    for (let m of availableMidis) {
      const diff = Math.abs(midi - m);
      if (diff < minDiff) {
        minDiff = diff;
        closest = m;
      }
    }
    
    return {
      buffer: instBuffers[closest],
      playbackRate: Math.pow(2, (midi - closest) / 12)
    };
  },

  async playTone(midi, startTime, duration) {
    if (!this.ctx) await this.init(); // Ensure ctx exists
    
    // Force resume if suspended (Crucial for iOS)
    if (this.ctx.state === 'suspended') {
        try {
            await this.ctx.resume();
        } catch (e) {
            console.error("Failed to resume context during playTone:", e);
            return; // Stop if we can't play
        }
    }

    const sample = this.getBestSample(midi, this.currentInstrument);

    if (sample && sample.buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = sample.buffer;
      source.playbackRate.value = sample.playbackRate;
      const gain = this.ctx.createGain();
      source.connect(gain);
      gain.connect(this.gainNode);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1.0, startTime + 0.02); 
      gain.gain.exponentialRampToValueAtTime(0.6, startTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration + 1.0); 
      
      source.start(startTime);
      source.stop(startTime + duration + 2.0);
    } else {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = this.currentInstrument === 'piano' ? 'triangle' : 'sawtooth';
      osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      osc.connect(gain);
      gain.connect(this.gainNode);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }
  },
  
  async playNotes(notes, mode, direction) { 
    if (!this.ctx) await this.init();

    // 1. State Check & Forced Resume
    if (this.ctx.state === 'suspended') {
        try {
            await this.ctx.resume();
            console.log("AudioContext resumed successfully.");
        } catch (e) {
            console.error("Could not resume AudioContext:", e);
            // You might want to trigger a UI alert here via a callback
            return;
        }
    }

    const now = this.ctx.currentTime;
    let sequence = [...notes].sort((a, b) => a - b);
    if (direction === 'desc') sequence.reverse();

    const arpSpeed = (this.currentInstrument === 'guitar' || this.currentInstrument === 'ukulele') ? 0.05 : 0;

    if (mode === 'harmonic') {
      sequence.forEach((n, i) => this.playTone(n, now + i * arpSpeed, 2.5));
      return 2.0;
    } else {
      sequence.forEach((n, i) => {
        this.playTone(n, now + i * 0.6, 1.5);
      });
      return sequence.length * 0.6 + 0.6; 
    }
  }
};

// --- 3. 自定义 Hooks ---
const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });
  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };
  return [storedValue, setValue];
};

// --- 4. 通用组件 ---

const TimerDisplay = ({ startTime, stoppedTime, isCorrect }) => {
   const [time, setTime] = useState(0);
   const reqRef = useRef();

   useEffect(() => {
      if (stoppedTime !== null && stoppedTime !== undefined) {
          setTime(stoppedTime);
          return;
      }
      if (!startTime) {
          setTime(0);
          return;
      }
      const update = () => {
         setTime((Date.now() - startTime) / 1000);
         reqRef.current = requestAnimationFrame(update);
      };
      reqRef.current = requestAnimationFrame(update);
      return () => {
        if (reqRef.current) cancelAnimationFrame(reqRef.current);
      };
   }, [startTime, stoppedTime]);

   let textColor = 'text-white';
   if (stoppedTime !== null) {
       textColor = isCorrect ? 'text-green-500' : 'text-red-500';
   }

   return (
      <div className={`font-mono text-base font-bold tabular-nums tracking-tight leading-none ${textColor}`}> 
         {time.toFixed(2)}<span className="text-xs text-zinc-600 ml-1 font-sans font-medium">s</span>
      </div>
   );
};

// --- 动画组件 ---
const MagneticLetter = ({ char }) => {
  return (
    <span className="inline-block transition-all duration-300 hover:-translate-y-2 hover:rotate-6 hover:scale-125 hover:text-indigo-600 origin-bottom cursor-default select-none">
      {char}
    </span>
  );
};

const InteractiveText = ({ text, className = "", baseColor = "text-black" }) => {
    return (
        <span className={`flex flex-wrap ${className}`}>
            {text.split('').map((char, index) => (
                <span 
                    key={index}
                    className={`inline-block transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:text-indigo-600 cursor-default select-none ${baseColor}`}
                    style={{ transitionDelay: `${index * 15}ms` }}
                >
                    {char === ' ' ? '\u00A0' : char}
                </span>
            ))}
        </span>
    );
};

// --- 5. 侧边面板组件 ---

const LeftPanel = ({ isOpen, onClose, history }) => {
    const menuItems = [
        { icon: <Activity size={20} />, label: 'New Practice' },
        { icon: <BookOpen size={20} />, label: 'Lessons' },
        { icon: <Globe size={20} />, label: 'News' },
        { icon: <HelpCircle size={20} />, label: 'Help' },
        { icon: <Shield size={20} />, label: 'Pro' },
    ];

    return (
        <>
            <div 
                className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-40 transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            ></div>
            <div className={`fixed inset-y-0 left-0 w-72 bg-zinc-950 border-r border-zinc-900 z-50 transform transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1) ${isOpen ? 'translate-x-0' : '-translate-x-full'} p-6 flex flex-col shadow-2xl`}>
                <div className="flex items-center gap-3 mb-8 text-white">
                    <Menu size={24} />
                    <span className="font-bold text-xl tracking-tight">Menu</span>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="space-y-4">
                         {menuItems.map((item, i) => (
                            <div 
                                key={i} 
                                className={`flex items-center gap-3 text-zinc-400 hover:text-white p-3 rounded-xl hover:bg-zinc-900 transition-all duration-500 ease-out cursor-pointer transform
                                    ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'}`}
                                style={{ transitionDelay: `${100 + i * 50}ms` }}
                                onClick={onClose}
                            >
                                {item.icon}
                                <span className="font-medium">{item.label}</span>
                            </div>
                        ))}

                        <div 
                            className={`pt-6 border-t border-zinc-900 mt-4 transform transition-all duration-700 ease-out ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
                            style={{ transitionDelay: '400ms' }}
                        >
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <History size={12} /> Recent History
                            </h3>
                            <div className="space-y-3">
                                {history.length === 0 ? (
                                    <p className="text-zinc-600 text-sm italic px-2">No history yet.</p>
                                ) : (
                                    history.slice(0, 5).map((item, i) => (
                                        <div key={i} className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-900">
                                            <div className="flex justify-between text-zinc-400 text-xs mb-1">
                                                <span>{new Date(item.date).toLocaleDateString()}</span>
                                                <span className={item.accuracy >= 80 ? 'text-green-500' : 'text-orange-500'}>{item.accuracy}%</span>
                                            </div>
                                            <div className="text-xs text-zinc-500 font-mono">
                                                Avg: {item.avgTime}s
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="pt-6 text-zinc-700 text-xs text-center border-t border-zinc-900">
                    Ear Pro v2.0
                </div>
            </div>
        </>
    );
};

const RightPanel = ({ isOpen, onClose, config, setConfig }) => {
    const getNoteDesc = (midi) => {
        const name = `${NOTE_NAMES[midi % 12]}${Math.floor(midi/12) - 1}`;
        return name;
    };

    const toggleDirection = (dir) => {
        setConfig(prev => {
            const current = prev.directions || ['asc'];
            if (current.includes(dir)) {
                if (current.length === 1) return prev;
                return { ...prev, directions: current.filter(d => d !== dir) };
            } else {
                return { ...prev, directions: [...current, dir] };
            }
        });
    };

    const toggleInterval = (id) => {
        setConfig(prev => {
            const current = prev.selectedIntervals;
            if (current.includes(id)) {
                if (current.length === 1) return prev;
                return { ...prev, selectedIntervals: current.filter(i => i !== id) };
            } else {
                return { ...prev, selectedIntervals: [...current, id] };
            }
        });
    };

    const setInstrument = (inst) => {
        setConfig(prev => ({ ...prev, instrument: inst }));
        AudioEngine.loadSamples(inst);
    };

    return (
        <>
            <div 
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            ></div>
            <div className={`fixed inset-y-0 right-0 w-80 bg-zinc-950 border-l border-zinc-900 z-50 transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} p-6 flex flex-col shadow-2xl`}>
                <div className="flex items-center justify-end gap-3 mb-8 text-white">
                    <span className="font-bold text-xl tracking-tight">Configuration</span>
                    <Settings size={24} />
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-8">
                    
                    {/* Instrument Selector */}
                    <section>
                         <div className="flex justify-between items-end mb-3">
                            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Instrument</h3>
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                            {Object.keys(INSTRUMENTS).map(key => (
                                <button
                                    key={key}
                                    onClick={() => setInstrument(key)}
                                    className={`py-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1
                                      ${config.instrument === key 
                                        ? 'bg-white text-black border-white shadow-lg' 
                                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'}
                                    `}
                                >
                                    {key === 'piano' && <Piano size={16} />}
                                    {key === 'guitar' && <Guitar size={16} />}
                                    {key === 'ukulele' && <Guitar size={16} className="scale-75" />}
                                    {INSTRUMENTS[key].name}
                                </button>
                            ))}
                         </div>
                    </section>

                    {/* Range */}
                    <section>
                         <div className="flex justify-between items-end mb-4">
                            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Range</h3>
                            <span className="text-white font-mono text-sm font-bold bg-zinc-900 px-2 py-1 rounded">{getNoteDesc(config.rangeMin)} - {getNoteDesc(config.rangeMax)}</span>
                         </div>
                         <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-6">
                            <div>
                                <label className="flex justify-between text-xs text-zinc-500 mb-2">Low Note</label>
                                <input 
                                    type="range" min="0" max="127" value={config.rangeMin}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (val < config.rangeMax) setConfig(prev => ({...prev, rangeMin: val}));
                                    }}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="flex justify-between text-xs text-zinc-500 mb-2">High Note</label>
                                <input 
                                    type="range" min="0" max="127" value={config.rangeMax}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (val > config.rangeMin) setConfig(prev => ({...prev, rangeMax: val}));
                                    }}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                                />
                            </div>
                         </div>
                    </section>
                    <section>
                         <div className="flex justify-between items-end mb-3">
                            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Questions</h3>
                            <span className="text-white font-mono text-sm font-bold bg-zinc-900 px-2 py-1 rounded">{config.questionCount}</span>
                         </div>
                         <input 
                           type="range" min="5" max="50" step="5" 
                           value={config.questionCount} 
                           onChange={(e) => setConfig(prev => ({...prev, questionCount: parseInt(e.target.value)}))}
                           className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
                         />
                    </section>
                    <section>
                        <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-3">Playback Mode</h3>
                        <div className="grid grid-cols-3 gap-2">
                           {[
                             { id: 'asc', label: 'Asc' },
                             { id: 'desc', label: 'Desc' },
                             { id: 'harmonic', label: 'Harm' }
                           ].map(opt => {
                              const isSelected = config.directions.includes(opt.id);
                              return (
                                 <button 
                                    key={opt.id}
                                    onClick={() => toggleDirection(opt.id)}
                                    className={`py-2.5 rounded-lg border text-xs font-bold transition-all
                                      ${isSelected 
                                        ? 'bg-white text-black border-white shadow-lg' 
                                        : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:bg-zinc-800'
                                      }`}
                                 >
                                    {opt.label}
                                 </button>
                              )
                           })}
                        </div>
                    </section>
                    <section>
                        <div className="flex justify-between items-center mb-3">
                           <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Intervals</h3>
                           <button 
                             onClick={() => setConfig(prev => ({...prev, selectedIntervals: ALL_INTERVALS.map(i => i.id)}))}
                             className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
                           >
                             Select All
                           </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                           {ALL_INTERVALS.map(int => {
                              const isSelected = config.selectedIntervals.includes(int.id);
                              return (
                                 <button
                                    key={int.id}
                                    onClick={() => toggleInterval(int.id)}
                                    className={`
                                       py-2 rounded-lg text-[10px] font-bold border transition-all relative overflow-hidden
                                       ${isSelected 
                                        ? 'bg-white border-white text-black shadow-sm' 
                                        : 'bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'}
                                    `}
                                 >
                                    {int.name}
                                    {isSelected && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                                 </button>
                              )
                           })}
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
};

// --- 6. 页面组件 ---

const HomeScreen = ({ mistakes, slowResponses, history, startSession, setView, setIsLeftPanelOpen, setIsRightPanelOpen }) => (
    <div className="flex flex-col h-full w-full bg-black overflow-hidden relative p-6 pt-14 pb-8">
        {/* Top Bar */}
        <div className="flex justify-between items-center mb-8 flex-none">
            <button onClick={() => setIsLeftPanelOpen(true)} className="text-zinc-400 hover:text-white transition-colors p-2 -ml-2">
                <Menu size={28} />
            </button>
            <button onClick={() => setIsRightPanelOpen(true)} className="text-zinc-400 hover:text-white transition-colors p-2 -mr-2">
                <Sliders size={28} />
            </button>
        </div>
        
        {/* Main Content Area - Vertical Card Stack */}
        <div className="flex-1 flex flex-col min-h-0 gap-4 pb-6 overflow-y-auto custom-scrollbar">
            
            {/* 1. Main Start Card (Top) - Horizontal Layout with Interactive Text */}
            <button 
                onClick={() => startSession('NEW')}
                className="flex-[1.5] w-full bg-white rounded-[2.5rem] p-8 relative overflow-hidden group transition-all active:scale-[0.98] shrink-0 min-h-[240px] flex flex-row items-center justify-between shadow-xl"
            >
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-zinc-100 to-transparent rounded-bl-full opacity-70 pointer-events-none"></div>
                
                {/* Left Side: Title & Subtitle */}
                <div className="flex flex-col justify-center items-start h-full z-10 space-y-4 w-full">
                     <div className="text-left">
                        {/* Animated EAR PRO Title with Magnetic Letters */}
                        <div className="text-5xl font-black tracking-tighter leading-[0.9] mb-2 flex flex-col items-start">
                            <div className="flex">
                                <MagneticLetter char="E" />
                                <MagneticLetter char="A" />
                                <MagneticLetter char="R" />
                            </div>
                            <div className="flex">
                                <MagneticLetter char="P" />
                                <MagneticLetter char="R" />
                                <MagneticLetter char="O" />
                            </div>
                        </div>
                        
                        {/* Animated Subtitle using InteractiveText */}
                        <div className="text-sm font-bold text-zinc-500 tracking-wide uppercase border-l-2 border-black pl-3 py-0.5">
                            <InteractiveText text="Professional" baseColor="text-zinc-500" />
                            <div className="h-0.5"></div>
                            <InteractiveText text="Ear Training" baseColor="text-zinc-500" />
                        </div>
                    </div>
                </div>

                {/* Right Side: Big Play Button */}
                <div className="flex flex-col justify-center items-center z-10 h-full pl-4">
                     <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-300">
                        <Play className="text-white ml-1" size={40} fill="white" />
                    </div>
                    <span className="text-zinc-900 font-bold text-xs uppercase tracking-widest mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">Start</span>
                </div>
            </button>

            {/* 2. Bottom Row: Mistakes & Slow - Side by Side */}
            <div className="flex-1 grid grid-cols-2 gap-4 min-h-[140px] shrink-0">
                 {/* Mistakes */}
                 <div 
                    className={`bg-zinc-900 rounded-[2rem] p-5 border border-zinc-800 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group
                        ${mistakes.length > 0 ? 'cursor-pointer hover:bg-zinc-800/80 hover:border-red-500/30' : 'opacity-50 cursor-not-allowed'}`}
                    onClick={() => mistakes.length > 0 && startSession('MISTAKES', mistakes)}
                 >
                    <div className="flex justify-between items-start z-10">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-red-400 transition-colors">Review</span>
                        <AlertCircle className={`transition-transform duration-300 group-hover:scale-110 ${mistakes.length > 0 ? "text-red-500" : "text-zinc-700"}`} size={20} />
                    </div>
                    <div className="z-10">
                        <div className="text-4xl font-mono font-bold text-white tracking-tighter leading-none mb-1 group-hover:scale-105 origin-left transition-transform">{mistakes.length}</div>
                        <div className="text-xs text-zinc-400 font-medium">Mistakes</div>
                    </div>
                 </div>

                 {/* Slow */}
                 <div 
                    className={`bg-zinc-900 rounded-[2rem] p-5 border border-zinc-800 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group
                        ${slowResponses.length > 0 ? 'cursor-pointer hover:bg-zinc-800/80 hover:border-yellow-500/30' : 'opacity-50 cursor-not-allowed'}`}
                    onClick={() => slowResponses.length > 0 && startSession('MISTAKES', slowResponses)}
                 >
                    <div className="flex justify-between items-start z-10">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider group-hover:text-yellow-400 transition-colors">Practice</span>
                        <Clock className={`transition-transform duration-300 group-hover:scale-110 ${slowResponses.length > 0 ? "text-yellow-500" : "text-zinc-700"}`} size={20} />
                    </div>
                    <div className="z-10">
                        <div className="text-4xl font-mono font-bold text-white tracking-tighter leading-none mb-1 group-hover:scale-105 origin-left transition-transform">{slowResponses.length}</div>
                        <div className="text-xs text-zinc-400 font-medium">Slow</div>
                    </div>
                 </div>
            </div>
        </div>
    </div>
);

const GameScreen = ({ queue, currentIndex, gameState, timerStart, responseTime, firstPlayDone, currentAnswer, config, playCurrentQuestion, handleAnswer, nextQuestion, setView, goBack }) => {
    const q = queue[currentIndex];
    const scrollRef = useRef(null);
    
    // Auto-scroll logic
    useEffect(() => {
        if (scrollRef.current) {
            const minNote = Math.min(...q.notes);
            const noteOffset = (minNote - config.rangeMin); 
            const scrollPos = Math.max(0, (noteOffset * 40) - 120); 
            
            scrollRef.current.scrollTo({
                left: scrollPos,
                behavior: 'smooth'
            });
        }
    }, [q, config.rangeMin]);

    // 监听 visibilitychange，从后台切回来时尝试恢复 AudioContext
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden && AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') {
                AudioEngine.ctx.resume().then(() => {
                    console.log('AudioContext resumed on visibility change');
                }).catch(e => console.warn(e));
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const playOptionSound = (interval) => {
       const notes = [q.root, q.root + interval.semitones];
       const mode = q.direction === 'harmonic' ? 'harmonic' : 'melodic';
       AudioEngine.playNotes(notes, mode, q.direction);
    };

    const renderPiano = () => {
       const centerMidi = q.root;
       const minNote = Math.min(...q.notes);
       const maxNote = Math.max(...q.notes);
       
       let startMidi = Math.min(minNote - 5, centerMidi - 7);
       let endMidi = Math.max(maxNote + 5, centerMidi + 7);
       
       startMidi = Math.max(0, startMidi);
       endMidi = Math.min(127, endMidi);

       const keys = [];
       for (let i = startMidi; i <= endMidi; i++) {
         keys.push(i);
       }

       return (
          <div className="flex justify-center items-start h-72 relative select-none rounded-xl bg-black border border-zinc-800">
             {keys.map((midi) => {
                const noteName = NOTE_NAMES[midi % 12];
                const isBlack = noteName.includes('#');
                if (isBlack) return null; 
                
                const nextMidi = midi + 1;
                const nextNoteName = NOTE_NAMES[nextMidi % 12];
                const hasBlackNext = nextNoteName.includes('#') && nextMidi <= endMidi;

                const isRoot = currentAnswer && q.notes.includes(midi) && midi === q.notes[0];
                const isTarget = currentAnswer && q.notes.includes(midi) && midi !== q.notes[0];

                const showLabel = !!currentAnswer; 
                const labelText = `${noteName}${Math.floor(midi/12)-1}`;

                return (
                   <div key={midi} className="relative flex-shrink-0">
                      {/* White Key */}
                      <div className={`
                          w-10 h-72 border-l border-b-[8px] border-r border-zinc-400/50 bg-gradient-to-b from-gray-100 to-white rounded-b-[4px] flex items-end justify-center pb-6 transition-all duration-75
                          ${isRoot ? '!bg-indigo-500 !from-indigo-500 !to-indigo-600 !border-indigo-800 shadow-[0_0_15px_rgba(99,102,241,0.5)] z-10 translate-y-[2px] border-b-[4px] !border-b-indigo-700' : ''}
                          ${isTarget ? '!bg-sky-400 !from-sky-400 !to-sky-500 !border-sky-600 shadow-[0_0_15px_rgba(56,189,248,0.5)] z-10 translate-y-[2px] border-b-[4px] !border-b-sky-600' : ''}
                          active:scale-[0.99]
                      `}>
                         {showLabel && (
                            <span className={`text-[10px] font-bold mb-2 select-none z-50 ${isRoot || isTarget ? 'text-white' : 'text-black/50'}`}>
                               {labelText}
                            </span>
                         )}
                      </div>
                      
                      {/* Black Key */}
                      {hasBlackNext && (
                         <div className={`
                            absolute -right-3 top-0 w-6 h-48 z-20 rounded-b-[3px] 
                            bg-gradient-to-b from-zinc-900 via-zinc-800 to-black
                            border-x border-b-[8px] border-zinc-950 shadow-md
                            transition-all duration-75
                            ${currentAnswer && q.notes.includes(nextMidi) 
                               ? (q.notes[0] === nextMidi 
                                   ? '!bg-indigo-700 !from-indigo-600 !to-indigo-900 !border-indigo-950 shadow-[0_0_15px_rgba(99,102,241,0.6)] translate-y-[2px] border-b-[3px]' 
                                   : '!bg-sky-600 !from-sky-500 !to-sky-800 !border-sky-950 shadow-[0_0_15px_rgba(56,189,248,0.6)] translate-y-[2px] border-b-[3px]')
                               : ''}
                         `}>
                            <div className="w-full h-4 bg-white/10 rounded-t-[3px] opacity-50"></div>
                         </div>
                      )}
                   </div>
                )
             })}
          </div>
       )
    };

    return (
      <div className="flex flex-col h-screen w-full bg-black overflow-hidden">
         
         {/* --- AREA 1: TOP (Header & Info) - Fixed --- */}
         <div className="flex-none flex justify-between items-center px-6 pt-14 pb-4 z-30 bg-black">
            {/* Left: Back Button */}
            <div className="w-20 flex justify-start">
                <button onClick={goBack} className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-white active:bg-zinc-800 transition-colors">
                    <ChevronLeft size={20} />
                </button>
            </div>

            {/* Center: Feedback & Timer */}
            <div className="flex-1 flex justify-center items-center gap-3">
                {/* Feedback (Left of time) */}
                {currentAnswer ? (
                   <div className={`flex items-center gap-1.5 animate-in slide-in-from-right-4 fade-in duration-300 ${currentAnswer.isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                       <span className="text-xl font-bold">
                           {currentAnswer.isCorrect ? '回答正确' : '回答错误'}
                       </span>
                       {/* Vertical line */}
                       <div className="w-px h-5 bg-zinc-800 mx-2"></div>
                   </div>
                ) : (
                   <div className="flex items-center gap-2 text-zinc-400 text-xl font-bold animate-in fade-in">
                      <span>仔细听</span>
                      <div className="w-px h-5 bg-zinc-800 mx-2"></div>
                   </div>
                )}
                
                {/* Timer */}
                <TimerDisplay startTime={timerStart} stoppedTime={responseTime} isCorrect={currentAnswer?.isCorrect} />
            </div>

            {/* Right: Progress (Fixed Position) */}
            <div className="w-20 flex justify-end items-center">
                <span className="text-lg font-mono font-bold text-white leading-none">
                    {currentIndex + 1}<span className="text-zinc-600 text-sm">/{queue.length}</span>
                </span>
            </div>
         </div>

         {/* --- AREA 2: MIDDLE (Piano Only) - Centered --- */}
         <div className="flex-1 flex flex-col justify-center items-center w-full min-h-0 relative z-0 bg-black px-4">
            {/* Piano Visualization Container - Centered */}
            <div className="w-full flex flex-col items-center">
               <div 
                  className="w-full max-w-md overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth snap-x pb-2"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
               >
                  <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
                  {renderPiano()}
               </div>
            </div>
         </div>

         {/* --- AREA 3: BOTTOM (Controls) - Fixed Panel --- */}
         <div className="flex-none bg-zinc-950 border-t border-zinc-900 p-4 pb-8 z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
            
            {/* Control Row */}
            <div className="flex gap-2 mb-3">
               <button 
                  onClick={playCurrentQuestion}
                  disabled={gameState === 'PLAYING'}
                  className={`h-10 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 font-bold text-xs
                     ${currentAnswer 
                        ? 'flex-1 bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700' 
                        : 'w-full bg-white text-black shadow-sm hover:bg-zinc-100'}
                     active:scale-95
                  `}
               >
                  {gameState === 'PLAYING' 
                     ? <Activity className="animate-pulse" size={16} /> 
                     : (currentAnswer ? <RefreshCw size={14} /> : <Play fill="currentColor" size={16} />)
                  }
                  {currentAnswer ? 'Replay' : 'Play Sound'}
               </button>

               {currentAnswer && (
                   <button 
                       onClick={nextQuestion}
                       className="flex-[2] h-10 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 animate-in fade-in slide-in-from-right-4"
                   >
                       Next <ChevronRight size={18} />
                   </button>
               )}
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-2 gap-2">
                {q.options.map(int => {
                    const isSelected = currentAnswer?.selectedId === int.id;
                    const isCorrect = currentAnswer?.correctId === int.id;
                    const showResult = !!currentAnswer;
                    
                    let btnClass = "border rounded-xl font-bold text-xs transition-all duration-200 relative overflow-hidden h-12";
                    
                    if (showResult) {
                        if (isCorrect) {
                            btnClass += " bg-green-600 border-green-500 text-white shadow-sm";
                        } else if (isSelected) {
                            btnClass += " bg-red-600 border-red-500 text-white";
                        } else {
                            // The "rest" of the options -> White Background, Black Text
                            btnClass += " bg-white border-zinc-200 text-black opacity-100";
                        }
                    } else {
                        // Default state before answering
                        btnClass += " bg-black border-zinc-800 text-zinc-300 hover:bg-zinc-800 active:scale-95 active:bg-white active:text-black";
                    }

                    return (
                        <button
                            key={int.id}
                            onClick={() => {
                                playOptionSound(int);
                                handleAnswer(int.id);
                            }}
                            className={btnClass}
                        >
                            {int.name}
                        </button>
                    );
                })}
            </div>
         </div>
      </div>
    );
};

// Main App
export default function App() {
  const [view, setView] = useState('HOME'); 
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const [mistakes, setMistakes] = useLocalStorage('ear_trainer_mistakes', []);
  const [slowResponses, setSlowResponses] = useLocalStorage('ear_trainer_slow', []);
  const [history, setHistory] = useLocalStorage('ear_trainer_history', []);
  
  const [config, setConfig] = useLocalStorage('ear_trainer_config', {
    rangeMin: 48, 
    rangeMax: 72, 
    directions: ['asc'], 
    questionCount: 10,
    selectedIntervals: ALL_INTERVALS.map(i => i.id),
    instrument: 'piano' 
  });

  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gameState, setGameState] = useState('IDLE');
  const [timerStart, setTimerStart] = useState(null);
  const [responseTime, setResponseTime] = useState(null);
  const [firstPlayDone, setFirstPlayDone] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState(null);
  
  const playbackTimeoutRef = useRef(null);

  const generateQuestionOptions = (correctInterval, pool) => {
      let effectivePool = pool;
      if (!pool.find(i => i.id === correctInterval.id)) {
          effectivePool = [...pool, correctInterval];
      }
      
      if (effectivePool.length <= 4) {
          return effectivePool.sort((a, b) => a.semitones - b.semitones);
      }
      
      const distractors = effectivePool.filter(i => i.id !== correctInterval.id)
                              .sort(() => 0.5 - Math.random())
                              .slice(0, 3);
      
      const options = [correctInterval, ...distractors];
      return options.sort((a, b) => a.semitones - b.semitones);
  };

  const startSession = async (mode = 'NEW', customQueue = null) => {
    let newQueue = [];
    
    await AudioEngine.init();
    if (config.instrument && config.instrument !== 'piano') {
        await AudioEngine.loadSamples(config.instrument);
    }
    
    const availableIntervals = ALL_INTERVALS.filter(int => config.selectedIntervals.includes(int.id));

    if (mode === 'NEW') {
      const { directions } = config;
      if (!directions || directions.length === 0) return alert("请至少选择一种播放模式");

      for (let i = 0; i < config.questionCount; i++) {
        const root = Math.floor(Math.random() * (config.rangeMax - config.rangeMin)) + config.rangeMin;
        
        if (availableIntervals.length === 0) return alert("请至少选择一个音程");
        
        const interval = availableIntervals[Math.floor(Math.random() * availableIntervals.length)];
        
        const randomDir = directions[Math.floor(Math.random() * directions.length)];
        let dir = randomDir;
        if (randomDir === 'random') dir = Math.random() > 0.5 ? 'asc' : 'desc';

        const options = generateQuestionOptions(interval, availableIntervals);

        newQueue.push({
          id: Date.now() + i,
          root: root,
          notes: [root, root + interval.semitones],
          interval: interval,
          direction: dir,
          options: options
        });
      }
    } else if (mode === 'MISTAKES') {
      newQueue = customQueue.map(q => ({
          ...q,
          id: Date.now() + Math.random(), 
          options: generateQuestionOptions(q.interval, availableIntervals)
      })).sort(() => Math.random() - 0.5);
    }

    if (newQueue.length === 0) return alert("没有题目可供练习");

    setQueue(newQueue);
    setCurrentIndex(0);
    setGameState('IDLE');
    setFirstPlayDone(false);
    setResponseTime(null);
    setCurrentAnswer(null);

    setView('GAME_INIT');

    try {
        await AudioEngine.init(); 
    } catch(e) {
        console.error("Audio init error", e);
    }

    setView('GAME');
  };

  const handleBackToHome = () => {
      if (playbackTimeoutRef.current) {
          clearTimeout(playbackTimeoutRef.current);
      }
      setTimerStart(null);
      setResponseTime(null);
      setGameState('IDLE');
      setFirstPlayDone(false);
      setView('HOME');
  };

  const playCurrentQuestion = useCallback(() => {
    const q = queue[currentIndex];
    if (!q) return;

    setGameState('PLAYING');
    const duration = AudioEngine.playNotes(q.notes, q.direction === 'harmonic' ? 'harmonic' : 'melodic', q.direction);
    
    if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
    playbackTimeoutRef.current = setTimeout(() => {
      setGameState('WAITING_ANSWER');
      // Only start timer if it hasn't started yet for this question
      if (!firstPlayDone) {
        setFirstPlayDone(true);
        setTimerStart(Date.now());
      }
    }, duration * 1000);

  }, [queue, currentIndex, firstPlayDone]);

  const handleAnswer = (intervalId) => {
    if (currentAnswer) return; 
    
    const now = Date.now();
    // If timer hasn't started (user answered during playback or before start), handle gracefully
    const timeTaken = timerStart ? (now - timerStart) / 1000 : 0;
    setResponseTime(timeTaken);

    const q = queue[currentIndex];
    const isCorrect = q.interval.id === intervalId;
    
    setCurrentAnswer({
      isCorrect,
      selectedId: intervalId,
      correctId: q.interval.id
    });
    setGameState('ANSWERED');

    if (!isCorrect) {
      setMistakes(prev => {
        const exists = prev.some(m => m.interval.id === q.interval.id && m.root === q.root);
        return exists ? prev : [...prev, q];
      });
    } else {
        setMistakes(prev => prev.filter(m => !(m.interval.id === q.interval.id && m.root === q.root)));
    }

    if (timeTaken > 2.0) {
      setSlowResponses(prev => {
        const exists = prev.some(m => m.interval.id === q.interval.id && m.root === q.root);
        return exists ? prev : [...prev, q];
      });
    }
  };

  const nextQuestion = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setGameState('IDLE');
      setFirstPlayDone(false);
      setResponseTime(null);
      setCurrentAnswer(null);
      setTimerStart(null);
      // Note: playCurrentQuestion will NOT be called automatically due to useEffect removal
    } else {
      setView('SUMMARY');
    }
  };

  return (
    <div className="w-full h-screen bg-black overflow-hidden font-sans selection:bg-blue-500 selection:text-white max-w-md mx-auto relative shadow-2xl">
       {view === 'HOME' && <HomeScreen mistakes={mistakes} slowResponses={slowResponses} history={history} startSession={startSession} setView={setView} setIsLeftPanelOpen={setIsLeftPanelOpen} setIsRightPanelOpen={setIsRightPanelOpen} />}
       {view === 'SETTINGS' && <SettingsScreen config={config} setConfig={setConfig} setView={setView} startSession={startSession} />}
       {view === 'GAME_INIT' && (
          <div className="h-full flex items-center justify-center text-white flex-col gap-4">
            <Loader2 className="animate-spin text-blue-500" size={48} />
            <p className="text-sm text-zinc-400">Loading Piano Samples...</p>
          </div>
       )}
       {view === 'GAME' && <GameScreen 
           queue={queue} 
           currentIndex={currentIndex} 
           gameState={gameState} 
           timerStart={timerStart} 
           responseTime={responseTime} 
           firstPlayDone={firstPlayDone} 
           currentAnswer={currentAnswer} 
           config={config} 
           playCurrentQuestion={playCurrentQuestion} 
           handleAnswer={handleAnswer} 
           nextQuestion={nextQuestion} 
           setView={setView}
           goBack={handleBackToHome} 
       />}
       {view === 'SUMMARY' && (
         <div className="flex flex-col h-full bg-black p-6 pt-24 items-center text-center space-y-8 animate-in fade-in">
           <Trophy size={64} className="text-yellow-500" />
           <div>
              <h2 className="text-3xl font-bold text-white mb-2">Session Complete!</h2>
              <p className="text-zinc-500">Great job keeping up the practice.</p>
           </div>
           
           <div className="w-full bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
              <div className="grid grid-cols-2 gap-8">
                 <div>
                    <div className="text-3xl font-bold text-white">{queue.length}</div>
                    <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Total</div>
                 </div>
                 <div>
                    <div className="text-3xl font-bold text-red-500">{mistakes.filter(m => queue.some(q => q.id === m.id)).length}</div>
                    <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Mistakes</div>
                 </div>
              </div>
           </div>
           
           <button 
              onClick={() => {
                const newRecord = {
                   date: Date.now(),
                   accuracy: Math.round((1 - (queue.filter(q => mistakes.some(m => m.id === q.id)).length / queue.length)) * 100),
                   avgTime: '2.5'
                };
                setHistory(prev => [newRecord, ...prev].slice(0, 10));
                setView('HOME');
              }}
              className="w-full max-w-xs bg-white text-black font-bold h-14 rounded-full mt-4"
           >
              Back to Home
           </button>
        </div>
       )}
       
       <LeftPanel isOpen={isLeftPanelOpen} onClose={() => setIsLeftPanelOpen(false)} history={history} />
       <RightPanel isOpen={isRightPanelOpen} onClose={() => setIsRightPanelOpen(false)} config={config} setConfig={setConfig} />
    </div>
  );

}

