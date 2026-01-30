interface MessageBubbleProps {
  content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  createdAt: string;
}

export default function MessageBubble({ content, direction, createdAt }: MessageBubbleProps) {
  const isInbound = direction === 'INBOUND';
  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
          isInbound
            ? 'bg-white border border-gray-200 text-gray-900'
            : 'bg-blue-600 text-white'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{content}</p>
        <p className={`text-xs mt-1 ${isInbound ? 'text-gray-400' : 'text-blue-200'}`}>
          {new Date(createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
