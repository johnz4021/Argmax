import { useEffect, useRef } from 'react';

export default function Transcript({ segments }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 border-b border-gray-800">
        Transcript
      </h2>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
            {seg.narration}
            {seg.active && (
              <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

    </div>
  );
}
