import type { Messages } from '..';

/** Wallet settings page (pages/wallet/Settings.tsx) */
const settings: Messages['settings'] = {
  title: 'Ajustes',
  lead: 'Estos ajustes se guardan solo en este navegador.',
  appearance: 'Apariencia',
  hideHint: 'Los saldos e importes se muestran como ••••, para abrir la billetera en público.',
  wallet: {
    connected: 'Conectada',
    demo: 'Cuenta de demostración (simulador en el navegador)',
    none: 'Aún no hay una billetera conectada.',
    disconnected: 'Billetera desconectada',
  },
  about: {
    title: 'Acerca de',
    build: 'Compilación',
    unknownBuild: 'Desconocida: no se compiló desde un checkout de git',
    chain: 'Cadena',
    repo: 'Código fuente',
    verifyHint: 'Para verificar esta página, recompila desde el mismo commit y compara el sha256 del resultado; los pasos están en README.md, en “verificar esta página”.',
  },
};

export default settings;
