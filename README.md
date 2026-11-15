# VolareSIM

Semplicissimo simulatore di volo in [Three.js](https://threejs.org/) con un Cessna monomotore.
Ispirato a [web-flight-simulator](https://github.com/dimartarmizi/web-flight-simulator), ma per aerei civili.

## Caratteristiche
- Fisica semplificata: spinta, resistenza, portanza, stallo, flap, freni, sterzo a terra
- Due aeroporti (Volare Intl e Monte Alto) con piste, luci, torre e hangar
- Camere: inseguimento, cabina, **cockpit 3D** con strumenti funzionanti, torre
- Suoni motore sintetizzati con WebAudio
- Tastiera, mouse (sguardo), joystick e gamepad
- HUD con velocità, quota, V/S, prua, orizzonte artificiale e avvisi di stallo

## Comandi
| Tasto | Azione |
|---|---|
| W / S | Picchia / cabra |
| A / D | Rollio sinistra / destra |
| Q / E | Pedaliera sinistra / destra |
| Shift / Z | Manetta più / meno (0–9 = manetta diretta) |
| F / G | Flap giù / su |
| B / Spazio | Freni |
| C | Cambia camera |
| K | Cambia aeroporto di partenza |
| P / R | Pausa / riparti |
| M | Audio on/off |
| I | Inverti asse beccheggio joystick |
| H | Mostra/nascondi aiuto |
| F11 | Schermo intero (app desktop) |

Decollo: manetta al massimo (9), a 55 kt tira dolcemente (S), sali a 70–80 kt.

## Sviluppo
```bash
npm install
npm run dev        # http://localhost:5173
```

## App desktop (Windows)
```bash
npm run app        # avvia la versione Electron
npm run dist       # crea installer e versione portable in release/
```
L'installer (`VolareSIM-<versione>-x64.exe`) e la versione portable si trovano nella cartella `release/`
e nelle *Releases* del repository. Un tag `v*` avvia la build automatica con GitHub Actions.

## Struttura
- `src/flight.js` fisica di volo · `src/world.js` terreno, aeroporti, cielo
- `src/aircraft.js` modello Cessna · `src/cockpit.js` cockpit 3D
- `src/controls.js` tastiera e joystick · `src/audio.js` suoni · `src/hud.js` HUD
- `electron/main.cjs` guscio desktop
