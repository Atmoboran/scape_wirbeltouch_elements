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
        penWidth: 'Stiftbreite',
        rotateLeft: 'Nach links drehen',
        rotateRight: 'Nach rechts drehen',
        hideTools: 'Werkzeuge ausblenden',
        showTools: 'Werkzeuge',
        medium: 'Medium',
        mediumAir: 'Luft (Wind)',
        mediumWater: 'Wasser (Kanal)',
        direction: 'Anströmung',
        dirRight: 'von links',
        dirLeft: 'von rechts',
        dirDown: 'von oben',
        dirUp: 'von unten',
        dirOff: 'aus',
        infoScenes: 'Fertige Aufbauten. Sie ersetzen alle Hindernisse und starten die Strömung neu.',
        infoMedium: 'Luft und Wasser gehorchen exakt denselben Gleichungen \u2013 unterschiedlich ist nur die Reynolds-Zahl, also das Verhältnis von Trägheit zu Zähigkeit. \u201eLuft\u201c ist auf Wind um ein Gebäude eingestellt (zügig, mit turbulentem Nachlauf), \u201eWasser\u201c auf eine langsame Strömung im Wasserkanal (saubere, regelmäßige Wirbelstraße). Kleine Überraschung: Wasser hat die kleinere kinematische Zähigkeit \u2013 bei gleicher Größe und Geschwindigkeit wäre also Wasser das turbulentere Medium.',
        infoDirection: 'Von welcher Seite die Strömung kommt \u2013 oder ganz aus. Die gegenüberliegende Kante wird zum Auslass, die beiden anderen bleiben feste Kanalwände.',
        infoView: 'Rauch zeigt die Bahnen der Luft, Geschwindigkeit die schnellen und langsamen Zonen, Wirbelstärke die Drehrichtung (blau gegen orange) und Druck die Über- und Unterdruckgebiete.',
        infoSmoke: 'Fäden zeigen einzelne Stromlinien, Fläche färbt die ganze Anströmung ein.',
        infoWind: 'Geschwindigkeit der Anströmung, gemessen in Gitterzellen pro Sekunde.',
        infoStripes: 'Wie viele Rauchfäden am Einlass ausgestoßen werden.',
        infoVorticity: 'Das grobe Rechengitter frisst kleine Wirbel auf. Dieser Regler gibt ihnen künstlich Energie zurück \u2013 ein Trick, kein echter physikalischer Term. Zu große Werte erzeugen Rauschen.',
        infoFade: 'Wie schnell sich der Rauch auflöst. Bei 0 bleiben die Fäden sichtbar, bis sie aus dem Bild gelaufen sind.',
        infoQuality: 'Feinheit des Rechengitters. Höher heißt kleinere Wirbel, aber deutlich mehr Rechenarbeit \u2013 auf dem Smartphone lieber eine Stufe niedriger.',
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
        hintRotate: 'Zwei Finger: drehen und Größe ändern',
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
              <li><strong>Drehen</strong> kannst du ein Hindernis mit den Pfeilen unter
              den Werkzeugen oder mit zwei Fingern direkt im Bild – zwei Finger ändern
              zugleich die Größe. Schau bei der Tragfläche, wann die Strömung abreißt.</li>
              <li>Unter <strong>Ansicht</strong> kannst du statt des Rauchs die
              Geschwindigkeit, die Wirbelstärke oder den Druck einfärben.</li>
            </ol>
            <p>Hinter einem runden Hindernis lösen sich abwechselnd Wirbel ab: die
            <em>Kármánsche Wirbelstraße</em>. Genau solche Wirbel verursachen das
            Brummen von Leitungen im Wind und die Böen hinter Gebäuden.</p>
            <p>Tastatur: <kbd>Leertaste</kbd> Pause, <kbd>W</kbd> Wind,
            <kbd>C</kbd> löschen, <kbd>R</kbd> Strömung neu, <kbd>1–4</kbd> Ansicht,
            <kbd>Q</kbd>/<kbd>E</kbd> drehen.</p>`,
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
        penWidth: 'Pen width',
        rotateLeft: 'Rotate left',
        rotateRight: 'Rotate right',
        hideTools: 'Hide tools',
        showTools: 'Tools',
        medium: 'Medium',
        mediumAir: 'Air (wind)',
        mediumWater: 'Water (flume)',
        direction: 'Inflow',
        dirRight: 'from the left',
        dirLeft: 'from the right',
        dirDown: 'from above',
        dirUp: 'from below',
        dirOff: 'off',
        infoScenes: 'Ready-made setups. They replace every obstacle and restart the flow.',
        infoMedium: 'Air and water obey exactly the same equations \u2013 what differs is the Reynolds number, the ratio of inertia to viscosity. \u201cAir\u201d is set up like wind around a building (brisk, with a turbulent wake), \u201cwater\u201d like a slow flow in a water flume (a clean, regular vortex street). A small surprise: water has the lower kinematic viscosity, so at the same size and speed water would be the more turbulent one.',
        infoDirection: 'Which side the flow comes from \u2013 or off entirely. The opposite edge becomes the outlet, the other two stay solid tunnel walls.',
        infoView: 'Smoke shows the paths the air takes, speed the fast and slow zones, vorticity the sense of rotation (blue against orange) and pressure the high and low pressure regions.',
        infoSmoke: 'Streak lines show individual streamlines, sheet colours the whole inflow.',
        infoWind: 'Speed of the inflow, measured in grid cells per second.',
        infoStripes: 'How many smoke lines are released at the inlet.',
        infoVorticity: 'The coarse grid eats small eddies. This slider hands energy back to them \u2013 a trick, not a real physical term. Large values produce noise.',
        infoFade: 'How quickly the smoke dissolves. At 0 the lines stay visible until they leave the picture.',
        infoQuality: 'Fineness of the computational grid. Higher means smaller eddies but a lot more work \u2013 on a phone, prefer one step lower.',
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
        hintRotate: 'Two fingers: rotate and resize',
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
              <li><strong>Rotate</strong> an obstacle with the arrows below the tools,
              or with two fingers directly on it – two fingers resize it at the same
              time. On the airfoil, watch for the moment the flow separates.</li>
              <li>Under <strong>View</strong> you can colour the field by speed,
              vorticity or pressure instead of smoke.</li>
            </ol>
            <p>Behind a round obstacle vortices peel off alternately: the
            <em>Kármán vortex street</em>. The same vortices make power lines hum in
            the wind and cause the gusts you feel behind buildings.</p>
            <p>Keyboard: <kbd>Space</kbd> pause, <kbd>W</kbd> wind,
            <kbd>C</kbd> clear, <kbd>R</kbd> reset flow, <kbd>1–4</kbd> view,
            <kbd>Q</kbd>/<kbd>E</kbd> rotate.</p>`,
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
