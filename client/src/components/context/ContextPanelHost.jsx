import ContextPanel from './ContextPanel';

export default function ContextPanelHost({ panels, expanded, className }) {
  if (!panels || panels.length === 0) return null;

  return (
    <div className={className || `border-b border-border overflow-y-auto ${expanded ? 'max-h-[40vh]' : 'max-h-[35%]'}`}>
      {panels.map((panel) => (
        <ContextPanel key={panel.id} panel={panel} />
      ))}
    </div>
  );
}
