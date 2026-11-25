// Bouwt een stalen raam met OCCT: een kader, roeden en glas.
//
// Het raam staat rechtop in het XZ-vlak, zoals in een muur:
//
//      z
//      ^   ______________________
//      |  | ___ | ___ | ___ |    |   <- bovendorpel
//      |  ||   |||   |||   ||    |
//      |  ||___|||___|||___||    |   <- liggende roede
//      |  ||   |||   |||   ||    |
//      |  ||___|||___|||___||    |
//      |  |_____________________|    <- onderdorpel
//      +--------------------------> x
//     0                      breedte
//
//   y is de diepte (de dikte van de muur in), x de breedte, z de hoogte.
//
// EÉN LIJST ONDERDELEN, net als bij de trap en de balustrade. raamDelen zegt
// van elk stuk staal en glas WAAR het zit en HOE GROOT het is; de geometrie,
// het voorbeeld tijdens het typen, de stuklijst, de zaaglijst en de kosten
// lezen allemaal diezelfde lijst. Daardoor kunnen ze niet uit de pas lopen.
//
// HET BOUWEN ZELF IS NIET NIEUW. Elk onderdeel gaat door maakDeel uit
// build-balustrade.js: met een profiel de echte doorsnede uit de catalogus,
// anders een blok. Hier staat dus alleen WAT er gebouwd wordt, niet HOE.
//
// WAT ER (NOG) NIET IN ZIT, zodat niemand het voor een productietekening
// aanziet: geen verstek in de kaderhoeken (de stijlen lopen door, de dorpels
// zitten ertussen - zo wordt een gelast kader ook vaak gemaakt), geen
// glaslatten of sponning, geen kit, geen draaiend deel.

import { initOcct } from './brep-edges.js';
import { stuklijst, maakDeel, materialenVan, uiterlijkVan } from './build-balustrade.js';
import { profielDoos } from './balustrade-rules.js';
import { berekenRaam, valideer, GLAS_SPELING } from './raam-regels.js';
import { groepeerVormen } from './onderdelen.js';
import { stempelWerk } from './materialen.js';
import { maakBoom } from './samenstelling.js';

// Elk onderdeel staat recht: zijn eigen assen zijn de wereldassen.
const RECHT = { xAs: [1, 0, 0], yAs: [0, 1, 0], zAs: [0, 0, 1] };

/**
 * De maten van een profiel: [zichtbare breedte, diepte].
 *
 * Met een profiel uit de catalogus komen ze uit dat profiel - een HQ 40x40x3
 * is 40 bij 40, wat er ook in een invulveld staat. Zonder profiel: het
 * invulveld, als vierkant.
 */
function matenVan(profiel, reserve) {
    const doos = profielDoos(profiel);
    return doos ? [doos[0], doos[1]] : [reserve, reserve];
}

/**
 * Alle onderdelen van een raam, als kale beschrijving in wereldcoördinaten.
 *
 * @param p  { breedte, hoogte, maxVakBreedte, maxVakHoogte, glasDikte,
 *             kaderMaat, roedeMaat, kaderProfiel?, roedeProfiel? }
 * @returns {{ delen, raam }}  raam = de uitkomst van berekenRaam
 */
export function raamDelen(p) {
    const [k, diepte] = matenVan(p.kaderProfiel, p.kaderMaat);
    const [r, roedeDiepte] = matenVan(p.roedeProfiel, p.roedeMaat);
    const raam = berekenRaam({ ...p, kader: k, roede: r });
    const { vakBreedte, vakHoogte } = raam;
    const B = p.breedte, H = p.hoogte;
    const delen = [];

    // --- het kader -------------------------------------------------------
    //
    // Eén samenstelling: de vier stukken worden samen gelast voordat er iets
    // anders in komt. Daarom één groep - de boom bij Resultaat toont dan
    // "Kader" met vier stukken eronder.
    const kader = { soort: 'kader' };
    const kaderDeel = (soort, oorsprong, maten, lengteAs) => delen.push({
        soort, groep: kader, oorsprong, ...RECHT, ...maten, lengteAs,
        profiel: p.kaderProfiel || null,
    });
    // De stijlen lopen over de hele hoogte door...
    kaderDeel('stijl', [0, 0, 0],     { dx: k, dy: diepte, dz: H }, 'z');
    kaderDeel('stijl', [B - k, 0, 0], { dx: k, dy: diepte, dz: H }, 'z');
    // ...en de dorpels zitten ertussen.
    kaderDeel('dorpel', [k, 0, 0],     { dx: B - 2 * k, dy: diepte, dz: k }, 'x');
    kaderDeel('dorpel', [k, 0, H - k], { dx: B - 2 * k, dy: diepte, dz: k }, 'x');

    // --- de roeden -------------------------------------------------------
    //
    // Midden in de diepte van het kader. De STAANDE roeden lopen van
    // onderdorpel tot bovendorpel door; de LIGGENDE zitten er per vak tussen.
    // Andersom kan ook; zo blijven de lange lijnen verticaal, wat bij een
    // steel-look raam het gebruikelijke beeld is.
    const yRoede = (diepte - roedeDiepte) / 2;
    const xVak = (kolom) => k + kolom * (vakBreedte + r);   // linkerkant van een vak
    const zVak = (rij) => k + rij * (vakHoogte + r);        // onderkant van een vak

    for (let i = 1; i < raam.kolommen; i++) {
        delen.push({
            soort: 'roede', oorsprong: [xVak(i) - r, yRoede, k], ...RECHT,
            dx: r, dy: roedeDiepte, dz: H - 2 * k, lengteAs: 'z',
            profiel: p.roedeProfiel || null,
        });
    }
    for (let j = 1; j < raam.rijen; j++) {
        for (let kolom = 0; kolom < raam.kolommen; kolom++) {
            delen.push({
                soort: 'roede', oorsprong: [xVak(kolom), yRoede, zVak(j) - r], ...RECHT,
                dx: vakBreedte, dy: roedeDiepte, dz: r, lengteAs: 'x',
                profiel: p.roedeProfiel || null,
            });
        }
    }

    // --- het glas --------------------------------------------------------
    //
    // Eén ruit per vak, aan elke kant GLAS_SPELING kleiner dan het gat. Midden
    // in de diepte, net als de roeden. Materiaal 'glas': daardoor slaan de
    // zaaglijst en de DXF hem over en gaat hij als besteld werk de
    // kostenraming in - dat regelt materialen.js, niet dit bestand.
    const g = p.glasDikte, s = GLAS_SPELING;
    const yGlas = (diepte - g) / 2;
    for (let rij = 0; rij < raam.rijen; rij++) {
        for (let kolom = 0; kolom < raam.kolommen; kolom++) {
            delen.push({
                soort: 'ruit', materiaal: 'glas',
                oorsprong: [xVak(kolom) + s, yGlas, zVak(rij) + s], ...RECHT,
                dx: vakBreedte - 2 * s, dy: g, dz: vakHoogte - 2 * s,
                lengteAs: 'x',
            });
        }
    }

    // Het gekozen metaal en de afwerking op alles wat staal is. Het glas
    // blijft glas; dat regelt stempelWerk zelf.
    stempelWerk(delen, p);

    return { delen, raam: { ...raam, kader: k, roede: r } };
}

/**
 * Bouwt het raam en levert de OCCT-vorm op, plus alles wat het paneel nodig
 * heeft. Zelfde opbouw als bouwTrap, zodat main.js er hetzelfde mee omgaat.
 */
export async function bouwRaam(p) {
    const { delen, raam } = raamDelen(p);
    // Gekeurd met de ECHTE profielmaat, niet met het invulveld: een zwaar
    // kaderprofiel kan een klein raam dichtzetten.
    const fouten = valideer({ ...p, kader: raam.kader });
    if (fouten.length) throw new Error('Ongeldige maten:\n- ' + fouten.join('\n- '));

    const oc = await initOcct();
    const builder = new oc.BRep_Builder();
    const bundel = new oc.TopoDS_Compound();
    builder.MakeCompound(bundel);

    const opruimen = [];
    const lokaal = [];
    try {
        for (const d of delen) {
            const gemaakt = await maakDeel(oc, d, opruimen);
            builder.Add(bundel, gemaakt.geplaatst);
            lokaal.push({ deel: d, vorm: gemaakt.lokaal });
        }
        const onderdelen = groepeerVormen(oc, lokaal);
        return {
            shape: bundel,
            raam,
            aantalDelen: delen.length,
            stuklijst: stuklijst(delen),
            onderdelen,
            boom: maakBoom(delen, onderdelen, 'Raam'),
            materialen: materialenVan(oc, delen),
            uiterlijk: uiterlijkVan(oc, delen),
            delen,
            // Geen verbindingenmodel voor een raam (nog): de keuring op
            // aansluitingen slaat het dan over in plaats van te gokken.
            verbindingen: [],
        };
    } finally {
        for (const o of opruimen) { try { o.delete(); } catch { /* al weg */ } }
    }
}
