import { useEffect, useRef } from 'react';
import MathText from './MathText';

export default function Transcript({ segments, agentStatus }) {
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments, agentStatus]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 border-b border-gray-800">
        Transcript
      </h2>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {segments.length === 0 && (
          <p className="text-gray-500 text-sm italic">
            Start a lesson to see the narration here...
          </p>
        )}

        {segments.map((seg) => (
          <div
            key={seg.id}
            className={`text-sm leading-relaxed rounded-lg px-3 py-2 ${
              seg.type === 'question'
                ? 'bg-blue-900/30 border border-blue-800 text-blue-200'
                : seg.type === 'answer'
                ? 'bg-purple-900/30 border border-purple-800 text-purple-200'
                : seg.type === 'guided_question'
                ? 'bg-gray-800/50 border border-gray-700 text-gray-300'
                : seg.type === 'guided_answer'
                ? 'bg-green-900/30 border border-green-800 text-green-200'
                : seg.type === 'student_message'
                ? 'bg-emerald-900/30 border border-emerald-800 text-emerald-200'
                : seg.type === 'verification'
                ? seg.matches
                  ? 'bg-green-900/40 border border-green-700 text-green-200'
                  : 'bg-red-900/40 border border-red-700 text-red-200'
                : seg.active
                ? 'bg-gray-800 text-gray-100'
                : 'text-gray-300'
            }`}
          >
            {seg.type === 'question' && (
              <span className="text-xs text-blue-400 font-medium block mb-1">You asked:</span>
            )}
            {seg.type === 'answer' && (
              <span className="text-xs text-purple-400 font-medium block mb-1">Argmax:</span>
            )}
            {seg.type === 'guided_question' && (
              <span className="text-xs text-gray-400 font-medium block mb-1">Argmax asked:</span>
            )}
            {seg.type === 'guided_answer' && (
              <span className="text-xs text-green-400 font-medium block mb-1">Your answer:</span>
            )}
            {seg.type === 'student_message' && (
              <span className="text-xs text-emerald-400 font-medium block mb-1">You:</span>
            )}
            {seg.type === 'verification' && (
              <span className={`text-xs font-medium block mb-1 ${seg.matches ? 'text-green-400' : 'text-red-400'}`}>
                {seg.matches ? '\u2713 Verified' : '\u2717 Mismatch'}
              </span>
            )}
            <MathText>{seg.narration}</MathText>
            {seg.active && (
              <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
            )}
          </div>
        ))}

        {agentStatus && (
          <div className="flex items-center gap-2 px-1 py-1 text-xs text-gray-400">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
            {agentStatus.status === 'tool' ? `${agentStatus.tool}...` : 'Thinking...'}
          </div>
        )}

      </div>

    </div>
  );
}
