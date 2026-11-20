import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  { ignores: ['.next/**', 'next-env.d.ts'] },
  {
    // Les effets d’hydratation et de chargement existants restent signalés.
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
];
