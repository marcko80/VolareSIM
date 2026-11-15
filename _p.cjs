const fs=require('fs');
const sub=(f,a,b)=>{let s=fs.readFileSync(f,'utf8');if(!s.includes(a))throw new Error(f+' missing '+a);fs.writeFileSync(f,s.replace(a,b));};
sub('README.md','npm run fetch-data   # re-download the real terrain data (needs internet)','npm run fetch-data   # re-download the real terrain data (needs internet)\nnode tools/fetch-ortho.mjs   # re-download the 50 cm AGEA orthophotos around the two airfields');
sub('README.md','The game reads these files at start-up. |','High-resolution inset photos come from `tools/fetch-ortho.mjs` (AGEA 2012 orthophotos at 1 m/px around LIAP, 2 m/px over 8 km and around the grass airfield), blended into the terrain shader over the satellite base. The game reads these files at start-up. |');
sub('README.it.md','npm run fetch-data','npm run fetch-data');
sub('README.it.md','Il gioco legge questi file all\'avvio. |','Le foto ad alta risoluzione vengono da `tools/fetch-ortho.mjs` (ortofoto AGEA 2012 a 1 m/px attorno a LIAP, 2 m/px su 8 km e attorno all\'aviosuperficie), fuse nello shader del terreno sopra la base satellitare. Il gioco legge questi file all\'avvio. |');
