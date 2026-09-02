// Tiny two-language dictionary (German / English). Elements carrying
// data-i18n get their text replaced, data-i18n-title their tooltip and
// data-i18n-html their markup.

export const STRINGS = {
    de: {
        title: 'WirbelTouch',
        subtitle: 'Strömung zum Anfassen',
        tools: 'Werkzeug',
        toolStir: 'Wirbeln',
        toolCircle: 'Zylinder',
        toolSquare: 'Quader',
        toolPlate: 'Platte',
        toolAirfoil: 'Tragfläche',
        toolHill: 'Berg',
        toolBrush: 'Freihand',
        toolEraser: 'Radierer',
        windOn: 'Wind an',
        windOff: 'Wind aus',
        pause: 'Pause',
        play: 'Weiter',
        resetFlow: 'Strömung neu',
        clear: 'Alles löschen',
        undo: 'Zurück',
        settings: 'Einstellungen',
        help: 'Hilfe',
        fullscreen: 'Vollbild',
        scenes: 'Szenen',
        sceneEmpty: 'Leer',
        sceneCylinder: 'Zylinder',
        sceneAirfoil: 'Tragfläche',
        scenePlate: 'Bremsklappe',
        sceneBuilding: 'Gebäude',
        sceneMountains: 'Bergkette',
        sceneVenturi: 'Düse',
        sceneSlit: 'Spalt',
        sceneTandem: 'Zwei Zylinder',
        view: 'Ansicht',
        viewDye: 'Rauch',
        viewSpeed: 'Geschwindigkeit',
        viewVorticity: 'Wirbelstärke',
        viewPressure: 'Druck',
        smokeStyle: 'Rauchbild',
        smokeLines: 'Fäden',
        smokeSheet: 'Fläche',
        windSpeed: 'Windgeschwindigkeit',
        size: 'Größe des Hindernisses',
        angle: 'Anstellwinkel',
        stripes: 'Anzahl Rauchfäden',
        vorticity: 'Wirbelverstärkung',
        fade: 'Rauch verblasst',
        quality: 'Rechengenauigkeit',
        qualityLow: 'niedrig',
        qualityMid: 'mittel',
        qualityHigh: 'hoch',
        qualityUltra: 'sehr hoch',
        hintPlace: 'Tippen: Hindernis setzen · Ziehen: verschieben',
        hintStir: 'Ziehen: Luft in Bewegung setzen',
        hintErase: 'Auf ein Hindernis tippen, um es zu entfernen',
        helpTitle: 'So funktioniert es',
        helpBody: `
            <p><strong>WirbelTouch</strong> ist ein kleiner Windkanal im Browser. Die
            Luft wird als Strömungsfeld berechnet – direkt auf der Grafikkarte deines
            Geräts, ohne Server.</p>
            <ol>
              <li><strong>Wind an</strong> startet die Strömung von links nach rechts.
              Die farbigen Rauchfäden zeigen, welchen Weg die Luft nimmt.</li>
              <li>Wähle ein <strong>Hindernis</strong> und tippe in die Strömung.
              Ziehen verschiebt es, der Radierer entfernt es.</li>
              <li>Mit <strong>Anstellwinkel</strong> kippst du Tragfläche oder Platte –
              schau, wann die Strömung abreißt.</li>
              <li>Unter <strong>Ansicht</strong> kannst du statt des Rauchs die
              Geschwindigkeit, die Wirbelstärke oder den Druck einfärben.</li>
            </ol>
            <p>Hinter einem runden Hindernis lösen sich abwechselnd Wirbel ab: die
            <em>Kármánsche Wirbelstraße</em>. Genau solche Wirbel verursachen das
            Brummen von Leitungen im Wind und die Böen hinter Gebäuden.</p>
            <p>Tastatur: <kbd>Leertaste</kbd> Pause, <kbd>W</kbd> Wind,
            <kbd>C</kbd> löschen, <kbd>R</kbd> Strömung neu, <kbd>1–4</kbd> Ansicht.</p>`,
        close: 'Schließen',
        noWebGL: 'Dieses Gerät kann WebGL nicht darstellen – die Simulation lässt sich leider nicht starten.'
    },
    en: {
        title: 'WirbelTouch',
        subtitle: 'Flow you can touch',
        tools: 'Tool',
        toolStir: 'Stir',
        toolCircle: 'Cylinder',
        toolSquare: 'Block',
        toolPlate: 'Plate',
        toolAirfoil: 'Airfoil',
        toolHill: 'Hill',
        toolBrush: 'Freehand',
        toolEraser: 'Eraser',
        windOn: 'Wind on',
        windOff: 'Wind off',
        pause: 'Pause',
        play: 'Resume',
        resetFlow: 'Reset flow',
        clear: 'Clear all',
        undo: 'Undo',
        settings: 'Settings',
        help: 'Help',
        fullscreen: 'Fullscreen',
        scenes: 'Scenes',
        sceneEmpty: 'Empty',
        sceneCylinder: 'Cylinder',
        sceneAirfoil: 'Airfoil',
        scenePlate: 'Air brake',
        sceneBuilding: 'Buildings',
        sceneMountains: 'Mountains',
        sceneVenturi: 'Nozzle',
        sceneSlit: 'Slit',
        sceneTandem: 'Two cylinders',
        view: 'View',
        viewDye: 'Smoke',
        viewSpeed: 'Speed',
        viewVorticity: 'Vorticity',
        viewPressure: 'Pressure',
        smokeStyle: 'Smoke style',
        smokeLines: 'Streak lines',
        smokeSheet: 'Sheet',
        windSpeed: 'Wind speed',
        size: 'Obstacle size',
        angle: 'Angle of attack',
        stripes: 'Number of streak lines',
        vorticity: 'Vortex boost',
        fade: 'Smoke fades',
        quality: 'Simulation detail',
        qualityLow: 'low',
        qualityMid: 'medium',
        qualityHigh: 'high',
        qualityUltra: 'very high',
        hintPlace: 'Tap to place an obstacle · drag to move it',
        hintStir: 'Drag to push the air around',
        hintErase: 'Tap an obstacle to remove it',
        helpTitle: 'How it works',
        helpBody: `
            <p><strong>WirbelTouch</strong> is a small wind tunnel in your browser.
            The air is solved as a real flow field – on your own graphics card, with
            no server involved.</p>
            <ol>
              <li><strong>Wind on</strong> starts a steady flow from left to right.
              The coloured streak lines show the path the air takes.</li>
              <li>Pick an <strong>obstacle</strong> and tap into the flow. Drag to
              move it, use the eraser to take it out again.</li>
              <li>The <strong>angle of attack</strong> tilts the airfoil or plate –
              watch for the moment the flow separates.</li>
              <li>Under <strong>View</strong> you can colour the field by speed,
              vorticity or pressure instead of smoke.</li>
            </ol>
            <p>Behind a round obstacle vortices peel off alternately: the
            <em>Kármán vortex street</em>. The same vortices make power lines hum in
            the wind and cause the gusts you feel behind buildings.</p>
            <p>Keyboard: <kbd>Space</kbd> pause, <kbd>W</kbd> wind,
            <kbd>C</kbd> clear, <kbd>R</kbd> reset flow, <kbd>1–4</kbd> view.</p>`,
        close: 'Close',
        noWebGL: 'This device cannot run WebGL, so the simulation cannot be started.'
    }
};

export function applyLanguage (lang) {
    const dict = STRINGS[lang] || STRINGS.de;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key] !== undefined) {
            el.title = dict[key];
            el.setAttribute('aria-label', dict[key]);
        }
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (dict[key] !== undefined) el.innerHTML = dict[key];
    });
    return dict;
}
