import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';

export interface EnergyChartData {
  bucket: string;
  total_kwh: number;
}

interface EnergyChartProps {
  data: EnergyChartData[];
  period: string;
  className?: string;
}

/**
 * Custom tooltip with modern styling
 */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-xl p-3 backdrop-blur-sm">
        <p className="text-sm font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry: any, idx: number) => (
          <p key={idx} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{Number(entry.value).toFixed(2)} kWh</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/**
 * Energy consumption chart component using Recharts
 */
const EnergyChart: React.FC<EnergyChartProps> = ({ data, period, className }) => {
  // Format the x-axis tick based on the period
  const formatXAxis = (bucket: string) => {
    try {
      const date = new Date(bucket);
      
      switch (period) {
        case '24h':
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case '7j':
          return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
        case '30j':
          return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
        default:
          return bucket;
      }
    } catch (e) {
      return bucket;
    }
  };

  // Format the tooltip label
  const formatTooltipLabel = (bucket: string) => {
    try {
      const date = new Date(bucket);
      
      switch (period) {
        case '24h':
          return date.toLocaleString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            day: 'numeric',
            month: 'short'
          });
        case '7j':
        case '30j':
          return date.toLocaleDateString([], { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
          });
        default:
          return bucket;
      }
    } catch (e) {
      return bucket;
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Consommation d'énergie</CardTitle>
        <Zap className="w-4 h-4 text-brand-500" />
      </CardHeader>
      <CardContent>
        <div className="h-80">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="bucket" 
                  tickFormatter={formatXAxis}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis 
                  unit=" kWh"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total_kwh"
                  name="Consommation"
                  stroke="#1a94d5"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#1a94d5' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full flex-col gap-2 text-muted-foreground">
              <Zap className="w-8 h-8" />
              <span>Aucune donnée de consommation</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergyChart;
