import ContextPanel from './ContextPanel';

export default function ContextPanelHost({ panels }) {
  if (!panels || panels.length === 0) return null;

  return (
    <div className="border-b border-gray-800 overflow-y-auto max-h-[40%]">
      {panels.map((panel) => (
        <ContextPanel key={panel.id} panel={panel} />
      ))}
    </div>
  );
}
