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

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-md">
          <p className="font-medium">{formatTooltipLabel(label)}</p>
          <p className="text-emerald-600">
            {`Consommation: ${payload[0].value.toFixed(2)} kWh`}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Consommation d'énergie</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="bucket" 
                tickFormatter={formatXAxis}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis 
                unit=" kWh"
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="total_kwh"
                name="Consommation (kWh)"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergyChart;