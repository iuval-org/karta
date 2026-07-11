import Dexie, { type Table } from 'dexie';

interface AppSetting {
  key: string;
  value: string;
}

class KartaDatabase extends Dexie {
  settings!: Table<AppSetting, string>;

  constructor() {
    super('KartaDatabase');
    this.version(1).stores({
      settings: 'key',
    });
  }
}

export const db = new KartaDatabase();
export type { AppSetting };
