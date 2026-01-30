interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  purple: 'bg-purple-50 text-purple-700',
};

export default function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorMap[color]}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
