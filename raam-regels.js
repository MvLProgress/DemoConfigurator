// Rekenregels voor een stalen raam: een kader, roeden en glas.
//
// De getallen staan in regels.json, onder "raam". Net als bij de balustrade en
// de trap is dat de enige bron; hier staat alleen de berekening.
//
//   INVOER     de buitenmaat (breedte, hoogte) en de grootste vakmaat
//   REGELS     de profielmaten van kader en roede
//   AFGELEID   aantal roeden in elke richting, en de werkelijke vakmaat
//
// Je zegt "1200 breed, vakken hoogstens 400"; de som zegt dat het 2 roeden en
// 3 vakken van 360 worden. Niet andersom.
//
// Dit bestand rekent alleen: geen OCCT, geen three.js, geen scherm. Daardoor
// is het los te testen tegen de ijkpunten in regels.json.

const regels = await (await fetch(new URL('./regels.json', import.meta.url))).json();

export const STANDAARD = regels.raam.standaard;
export const GRENZEN = regels.raam.grenzen;
export const IJKPUNTEN = regels.raam.ijkpunten;
export const PROFIELEN = regels.raam.profielen;
export const GLAS_SPELING = regels.raam.glasSpeling;

const OMSCHRIJVING = {
    breedte: 'breedte',
    hoogte: 'hoogte',
    maxVakBreedte: 'max. vakbreedte',
    maxVakHoogte: 'max. vakhoogte',
    glasDikte: 'ruitdikte',
};

/**
 * Verdeelt één richting in vakken.
 *
 * Dezelfde som als de spijlen van een balustrade: n roeden geven n+1 vakken,
 * en geen vak mag groter zijn dan `maxVak`. Naar BOVEN afronden - naar
 * beneden zou precies het ene vak opleveren dat te groot is.
 *
 * @param maat    de buitenmaat in die richting (mm)
 * @param kader   de zichtbare breedte van het kaderprofiel (mm)
 * @param roede   de zichtbare breedte van een roede (mm)
 * @param maxVak  de grootste vakmaat die mag (mm)
 * @returns {{ roeden, vakken, vak, binnen }}
 */
export function verdeel(maat, kader, roede, maxVak) {
    const binnen = maat - 2 * kader;
    const roeden = Math.max(0, Math.ceil((binnen - maxVak) / (maxVak + roede)));
    // NIET afronden: met een afgeronde vakmaat schuift elke volgende roede een
    // fractie op, en de laatste staat zichtbaar scheef. Afronden doe je bij
    // het tonen.
    const vak = (binnen - roeden * roede) / (roeden + 1);
    return { roeden, vakken: roeden + 1, vak, binnen };
}

/**
 * Het hele raam: hoeveel roeden in de breedte en in de hoogte.
 *
 * @param p  { breedte, hoogte, maxVakBreedte, maxVakHoogte, kader, roede }
 *           kader en roede zijn de profielmaten; zie raamDelen.
 */
export function berekenRaam(p) {
    const kolommen = verdeel(p.breedte, p.kader, p.roede, p.maxVakBreedte);
    const rijen = verdeel(p.hoogte, p.kader, p.roede, p.maxVakHoogte);
    return {
        verticaal: kolommen.roeden,     // roeden die rechtop staan
        horizontaal: rijen.roeden,      // roeden die liggen
        kolommen: kolommen.vakken,
        rijen: rijen.vakken,
        vakBreedte: kolommen.vak,
        vakHoogte: rijen.vak,
        ruiten: kolommen.vakken * rijen.vakken,
    };
}

/** Wat er mis is met de invoer, als zinnen. Een lege lijst: alles goed. */
export function valideer(p) {
    const fouten = [];
    for (const [naam, [min, max]] of Object.entries(GRENZEN)) {
        const waarde = p[naam];
        if (typeof waarde !== 'number' || !Number.isFinite(waarde)) {
            fouten.push(`${OMSCHRIJVING[naam]}: geen geldig getal`);
        } else if (waarde < min || waarde > max) {
            fouten.push(`${OMSCHRIJVING[naam]}: ${waarde} mm valt buiten ${min}–${max} mm`);
        }
    }
    // Er moet binnen het kader nog iets overblijven, anders is er geen glas.
    // Met een kader van 40 is dat bij 300 mm ruim; met een zwaar profiel niet.
    if (fouten.length === 0 && p.kader > 0) {
        for (const [naam, maat] of [['breedte', p.breedte], ['hoogte', p.hoogte]]) {
            if (maat - 2 * p.kader < 50) {
                fouten.push(`${naam}: ${maat} mm laat binnen een kader van `
                    + `${p.kader} mm minder dan 50 mm glas over`);
            }
        }
    }
    return fouten;
}
