import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
  className?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  unit,
  icon,
  trend,
  className,
}) => {
  const getTrendColor = (direction: TrendDirection): string => {
    switch (direction) {
      case 'up':
        return 'text-emerald-500';
      case 'down':
        return 'text-red-500';
      case 'neutral':
      default:
        return 'text-gray-500';
    }
  };

  const getTrendIcon = (direction: TrendDirection): React.ReactNode => {
    switch (direction) {
      case 'up':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.061l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042-.815a.75.75 0 01-.53-.919z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'down':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M1.22 5.222a.75.75 0 011.06 0L7 9.942l3.768-3.769a.75.75 0 011.113.058 20.908 20.908 0 013.813 7.254l1.574-2.727a.75.75 0 011.3.75l-2.475 4.286a.75.75 0 01-.966.364l-4.285-1.81a.75.75 0 01.483-1.425l3.38 1.428A19.41 19.41 0 007.647 7.934l-3.706 3.706L1.22 8.92a.75.75 0 010-1.06l3.697-3.697-3.697-3.697a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
        );
      case 'neutral':
      default:
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  return (
    <Card className={cn('shadow-md hover:shadow-lg transition-shadow', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon && <div className="text-emerald-600">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <div className="text-2xl font-bold">
            {value}
            {unit && <span className="ml-1 text-sm font-normal">{unit}</span>}
          </div>
          {trend && (
            <div className="flex items-center mt-1">
              <span className={cn('flex items-center text-xs', getTrendColor(trend.direction))}>
                {getTrendIcon(trend.direction)}
                <span className="ml-1">{trend.value}</span>
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default KpiCard;