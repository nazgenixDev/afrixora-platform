import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export type TrendDirection = 'up' | 'down' | 'neutral';

export interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  trend?: {
    direction: TrendDirection;
    value: string | number;
  };
  accentColor?: string;
  className?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  unit,
  icon,
  trend,
  accentColor = 'emerald',
  className,
}) => {
  const getTrendConfig = (direction: TrendDirection) => {
    switch (direction) {
      case 'up':
        return {
          color: 'text-emerald-500',
          bg: 'bg-emerald-50 dark:bg-emerald-500/10',
          icon: <TrendingUp className="w-3.5 h-3.5" />,
        };
      case 'down':
        return {
          color: 'text-red-500',
          bg: 'bg-red-50 dark:bg-red-500/10',
          icon: <TrendingDown className="w-3.5 h-3.5" />,
        };
      case 'neutral':
      default:
        return {
          color: 'text-gray-500',
          bg: 'bg-gray-50 dark:bg-gray-500/10',
          icon: <Minus className="w-3.5 h-3.5" />,
        };
    }
  };

  const accentMap: Record<string, string> = {
    emerald: 'border-l-emerald-500',
    blue: 'border-l-blue-500',
    orange: 'border-l-orange-500',
    red: 'border-l-red-500',
    purple: 'border-l-purple-500',
    green: 'border-l-green-500',
  };

  const iconBgMap: Record<string, string> = {
    emerald: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    blue: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
    orange: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
    red: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
    purple: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
    green: 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400',
  };

  return (
    <Card className={cn(
      'relative overflow-hidden border-l-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5',
      accentMap[accentColor] || accentMap.emerald,
      className
    )}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon && (
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            iconBgMap[accentColor] || iconBgMap.emerald
          )}>
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <div className="text-2xl font-bold tracking-tight">
            {value}
            {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
          </div>
          {trend && (
            <div className="flex items-center mt-2">
              <span className={cn(
                'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
                getTrendConfig(trend.direction).bg,
                getTrendConfig(trend.direction).color,
              )}>
                {getTrendConfig(trend.direction).icon}
                <span>{trend.value}</span>
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default KpiCard;
