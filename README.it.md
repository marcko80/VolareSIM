<div align="center">

# ✈️ VolareSIM

**Un semplice simulatore di volo civile realizzato con [Three.js](https://threejs.org/)** — pilota un monomotore tipo Cessna tra due aeroporti, nel browser o come app desktop per Windows.

[![Three.js](https://img.shields.io/badge/Three.js-r187-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Electron](https://img.shields.io/badge/Electron-desktop-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
![Piattaforme](https://img.shields.io/badge/piattaforme-Web%20%7C%20Windows-blue)
![Lingue](https://img.shields.io/badge/lingue-EN%20%7C%20IT-green)

[English](README.md) · **Italiano**

<img src="docs/screenshots/hero-chase.png" alt="Il Cessna in virata sopra la pista di Volare Intl" width="900">

</div>

## In breve

| | |
|---|---|
| 🛩️ **Modello di volo** | Spinta, resistenza, portanza, stallo, flap, freni e sterzo del ruotino: pensato per ricordare un addestratore monomotore leggero |
| 🌍 **Due aeroporti** | *Volare Intl* (livello del mare, pista da 1200 m) e *Monte Alto* (90 m di quota, pista da 900 m con prua 060°), a circa 9 km di distanza, con torri, hangar, luci e fari |
| 🎥 **Quattro camere** | Inseguimento, cabina, **cockpit 3D** con strumenti funzionanti e torre di controllo. Trascina il mouse per guardarti attorno |
| 🔊 **Suoni sintetizzati** | Motore a quattro cilindri legato ai giri, elica, vento, rotolamento, cicalino di stallo e tonfo del contatto: nessun file audio |
| 🎮 **Tastiera, mouse, joystick, gamepad** | Funzionano subito grazie alla Gamepad API del browser |
| 🌐 **Italiano e inglese** | Rilevati automaticamente; cambia quando vuoi con <kbd>L</kbd> o con il pulsante in alto a sinistra |
| 🖥️ **Installer desktop** | Installer Windows e versione portable, generati con Electron |

## Screenshot

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/cockpit.png" alt="Cockpit 3D"><br><sub><b>Cockpit 3D</b> — anemometro, orizzonte artificiale, altimetro, giri motore, prua e variometro; il volantino segue i tuoi comandi</sub></td>
    <td width="50%"><img src="docs/screenshots/takeoff-hud.png" alt="Pronti al decollo con HUD e aiuto"><br><sub><b>Pronti al decollo</b> — HUD, orizzonte artificiale e pannello dei comandi (<kbd>H</kbd>)</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/airport-b.png" alt="Aeroporto Monte Alto"><br><sub><b>Monte Alto</b> — il secondo aeroporto a 295 ft, con pista, torre e faro</sub></td>
    <td width="50%"><img src="docs/screenshots/approach.png" alt="Finale con interfaccia in italiano"><br><sub><b>Finale</b> con flap a 20° — qui con l'interfaccia in italiano</sub></td>
  </tr>
</table>

## Avvio rapido

### Nel browser

```bash
git clone https://github.com/marcko80/VolareSIM.git
cd VolareSIM
npm install
npm run dev          # apri http://localhost:5173
```

Funziona con qualsiasi browser moderno con WebGL 2 (Chrome, Edge, Firefox, Safari).

### App per Windows

Scarica **`VolareSIM-Setup-<versione>.exe`** (installer) oppure **`VolareSIM-Portable-<versione>.exe`** (senza installazione) dalla pagina [Releases](../../releases).
Windows SmartScreen può avvisare che l'app non è firmata: scegli *Ulteriori informazioni → Esegui comunque*. Con <kbd>F11</kbd> vai a schermo intero.

Per compilarla da te:

```bash
npm run app          # avvia l'app Electron dal codice sorgente
npm run dist         # crea installer e versione portable in release/
```

## Come si vola

1. Premi <kbd>9</kbd> per la manetta al massimo.
2. A circa **55 kt** tira dolcemente (<kbd>S</kbd>) e lascia che l'aereo si stacchi.
3. Sali a **70–80 kt**. Rientra i flap (<kbd>G</kbd>) se li hai usati.
4. Per atterrare riduci la potenza, estendi i flap (<kbd>F</kbd>), vola l'avvicinamento a circa 65 kt e richiama appena sopra la pista. Il simulatore valuta il contatto in base alla velocità di discesa (morbido, buono, duro); un impatto violento o un'ala toccata a terra è un incidente: premi <kbd>R</kbd> per ripartire.

### Comandi

| Tasto | Azione |
|---|---|
| <kbd>W</kbd> / <kbd>S</kbd> | Picchia / cabra |
| <kbd>A</kbd> / <kbd>D</kbd> | Rollio sinistra / destra |
| <kbd>Q</kbd> / <kbd>E</kbd> | Pedaliera sinistra / destra |
| <kbd>Shift</kbd> / <kbd>Z</kbd> | Aumenta / diminuisci la manetta |
| <kbd>0</kbd>–<kbd>9</kbd> | Manetta diretta (0 = minimo, 9 = massimo) |
| <kbd>F</kbd> / <kbd>G</kbd> | Flap giù / su (0°, 10°, 20°, 30°) |
| <kbd>B</kbd> / <kbd>Spazio</kbd> | Freni |
| <kbd>C</kbd> | Cambia camera: inseguimento → cabina → cockpit → torre |
| Trascina il mouse | Guarda attorno |
| <kbd>K</kbd> | Passa all'altro aeroporto |
| <kbd>P</kbd> / <kbd>R</kbd> | Pausa / riparti |
| <kbd>M</kbd> | Audio on / off |
| <kbd>I</kbd> | Inverti l'asse di beccheggio del joystick |
| <kbd>L</kbd> | Lingua EN / IT |
| <kbd>H</kbd> | Mostra / nascondi l'aiuto |

**Gamepad** (mappatura standard): stick sinistro = beccheggio/rollio, stick destro = pedaliera, RT/LT = manetta, A = freni, RB/LB = flap, Y = camera, X = riparti, Start = pausa, Back = aeroporto.
**Joystick** (es. Logitech Extreme 3D): X/Y = rollio/beccheggio, torsione = pedaliera, cursore = manetta, grilletto = freni, pulsanti 3/4 = flap giù/su, pulsante 2 = camera.

## Come funziona

| Area | Dettagli |
|---|---|
| **Dinamica di volo** (`src/flight.js`) | Passo fisso a 120 Hz. 1100 kg, ala da 16,2 m², 135 kW con rendimento dell'elica 0,78 e spinta statica di 3,4 kN. Pendenza della portanza 5 per radiante con stallo a 17° di incidenza e calo morbido dopo lo stallo; i flap spostano l'angolo di portanza nulla e aumentano la resistenza. La stabilità in beccheggio cresce vicino allo stallo: si stalla perdendo velocità, non tirando la barra. La densità dell'aria diminuisce con la quota. |
| **Gestione a terra** | Carrello triciclo con tre punti di contatto, attrito di rotolamento (0,02 in pista, 0,09 sull'erba), freni, sterzo del ruotino che dipende dalla velocità e limite di beccheggio per evitare il contatto della coda. |
| **Numeri tipici** | Corsa di decollo ≈ 250 m, rotazione a 55 kt, salita ≈ 800 ft/min, stallo ≈ 45 kt a flap rientrati, velocità massima ≈ 140 kt. |
| **Mondo** (`src/world.js`) | Terreno procedurale di 26 × 26 km (mesh 400 × 400) con colline, boschi, nuvole, nebbia, cielo calcolato in shader e ombre che seguono l'aereo. Il terreno è livellato attorno a ogni aeroporto. |
| **Aereo** (`src/aircraft.js`) | Cessna procedurale con fusoliera tornita, alettoni, flap, equilibratore e timone animati, luci di navigazione, strobo ed elica rotante. |
| **Cockpit** (`src/cockpit.js`) | Pannello strumenti disegnato su una texture canvas a frame alterni; volantino e manetta ripetono i tuoi comandi. |
| **Audio** (`src/audio.js`) | Oscillatori e rumore filtrato WebAudio; frequenza di scoppio = giri / 60 × 2. |
| **Input** (`src/controls.js`) | Tastiera con superfici di comando graduali; Gamepad API con zona morta e curve esponenziali. |
| **i18n** (`src/i18n.js`) | Traduzioni IT/EN basate su dizionario, ricordate in `localStorage`. |

```
VolareSIM/
├── index.html             # struttura di HUD e aiuto
├── src/
│   ├── main.js            # scena, camere, ciclo di gioco
│   ├── flight.js          # fisica di volo e a terra
│   ├── world.js           # terreno, aeroporti, cielo
│   ├── aircraft.js        # modello del Cessna
│   ├── cockpit.js         # cockpit 3D
│   ├── controls.js        # tastiera / gamepad
│   ├── audio.js           # suoni sintetizzati
│   ├── hud.js             # HUD e orizzonte artificiale
│   └── i18n.js            # traduzioni
├── electron/main.cjs      # guscio desktop
├── tools/screenshots.mjs  # rigenera docs/screenshots
└── .github/workflows/release.yml   # compila l'installer Windows sui tag
```

## Sviluppo

```bash
npm run dev           # server di sviluppo con hot reload
npm run build         # build di produzione in dist/
npm run screenshots   # ricompila e cattura docs/screenshots tramite Electron
npm run dist          # installer Windows + versione portable
```

Pubblicando un tag come `v0.4.0`, GitHub Actions compila l'installer e lo allega alla release.

## Roadmap

- Vento e meteo, laghi e fiumi
- Navigazione: waypoint, radioassistenze, un semplice pilota automatico
- Altri aerei (bimotore, jet leggero) e una pipeline per modelli 3D (`.glb`)
- Altri aeroporti e modalità notturna

## Crediti

Ispirato a [web-flight-simulator](https://github.com/dimartarmizi/web-flight-simulator), reinterpretato per l'aviazione civile. Realizzato con [Three.js](https://threejs.org/), [Vite](https://vitejs.dev/) ed [Electron](https://www.electronjs.org/).
