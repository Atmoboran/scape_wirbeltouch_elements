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
        sceneSkyline: 'Frankfurter Skyline',
        sceneRoomOne: 'Raum, ein Fenster',
        sceneRoomCross: 'Querlüftung',
        dropToDelete: 'Zum Löschen hierher ziehen',
        helpTabBasic: 'Kurz erklärt',
        helpTabAdvanced: 'Erweiterte Erklärung',
        hintDrag: 'Hindernis in den Papierkorb ziehen löscht es',
        helpAdvanced: `
            <p>Gerechnet werden die <strong>inkompressiblen Navier-Stokes-Gleichungen</strong>
            in zwei Dimensionen, nach dem Verfahren <em>Stable Fluids</em> (Jos Stam, 1999).
            Jedes Bild durchläuft vier Schritte:</p>
            <ol>
              <li><strong>Anströmung</strong>: In einem schmalen Band am Einlass wird die
              Geschwindigkeit auf den Sollwert gezogen, am Auslass dämpft ein Schwamm
              Rückwirkungen.</li>
              <li><strong>Wirbelverstärkung</strong> (vorticity confinement): gibt kleinen
              Wirbeln Energie zurück, die das grobe Gitter wegmittelt.</li>
              <li><strong>Projektion</strong>: Divergenz berechnen, daraus das Druckfeld
              lösen, den Druckgradienten abziehen. Erst das macht die Strömung
              quellenfrei. Gelöst wird mit Jacobi-Iterationen plus einer Korrektur auf
              einem vierfach gröberen Gitter.</li>
              <li><strong>Advektion</strong>: Geschwindigkeit und Rauch werden semi-lagrangesch
              rückwärts entlang der Bahnen interpoliert.</li>
            </ol>
            <p>Das Rechengitter hat bei mittlerer Qualität rund <strong>455 × 256 Zellen</strong>,
            der Rauch wird auf einem feineren Gitter mit etwa 1820 × 1024 Punkten transportiert.
            Alle Schritte laufen als Fragment-Shader auf der Grafikkarte – etwa 10 Millionen
            Pixelberechnungen pro Bild, komplett im Browser, ohne Server.</p>
            <p><strong>Hindernisse</strong> stecken in einer Maskentextur. An festen Rändern wird
            die Normalgeschwindigkeit gespiegelt (macht sie an der Wand zu null), der Druck
            bekommt eine Neumann-Bedingung, und im Inneren wird die Geschwindigkeit gelöscht –
            zusammen eine Haftbedingung. Die Kante läuft weich über etwa eine Zelle, sonst
            würde jede schräge Wand als Treppe wirken und an jeder Stufe einen Miniwirbel
            abwerfen. Beim Einschalten wird das ganze Feld sofort mit der Anströmung gefüllt,
            damit keine künstliche Startfront durchs Bild läuft.</p>
            <h3>Wo das Modell an seine Grenzen kommt</h3>
            <ul>
              <li>Die Druckgleichung wird <strong>nicht bis zur letzten Stelle auskonvergiert</strong>.
              Ein Jacobi-Schritt trägt Information nur eine Zelle weit, für große Gebiete wäre
              das viel zu langsam – deshalb läuft zusätzlich eine Korrektur auf einem
              gröberen Gitter. Erst sie sorgt dafür, dass auch große Räume ihre Massenbilanz
              einhalten. Ein kleiner Rest Kompressibilität bleibt.</li>
              <li>Die Zähigkeit ist <strong>numerisch, nicht physikalisch</strong>. Es gibt also keine
              einstellbare Reynolds-Zahl; die Voreinstellungen Luft und Wasser treffen nur
              das ungefähre Regime.</li>
              <li>Die Wirbelverstärkung ist ein <strong>Trick</strong>, kein Term der Gleichungen. Sie
              führt dem Feld Energie zu – zu hohe Werte lassen die Strömung unruhig werden.</li>
              <li>Zwei Dimensionen sind nicht drei: In 2D können Wirbel keine Wirbelfäden
              strecken, die Energie wandert zu großen statt zu kleinen Skalen. Echte
              Turbulenz sieht anders aus.</li>
            </ul>
            <p>Kurz: qualitativ richtig und zum Ausprobieren gedacht, aber keine
            Ingenieursimulation. Wer Kräfte oder Druckbeiwerte braucht, rechnet mit
            richtiger CFD.</p>`,
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
              Ziehen verschiebt es, der Radierer entfernt es. Das blau umrandete
              Hindernis ist das ausgewählte – Größe und Drehung wirken auf dieses.</li>
              <li><strong>Drehen</strong> kannst du ein Hindernis mit den Pfeilen unter
              den Werkzeugen oder mit zwei Fingern direkt im Bild – zwei Finger ändern
              zugleich die Größe. Schau bei der Tragfläche, wann die Strömung abreißt.</li>
              <li>Unter <strong>Ansicht</strong> kannst du statt des Rauchs die
              Geschwindigkeit, die Wirbelstärke oder den Druck einfärben.</li>
            </ol>
            <p>Probier die beiden Raum-Szenen aus: Mit nur einem Fenster passiert fast
            nichts – die Luft hat keinen Weg hinaus. Erst ein zweites Fenster auf der
            gegenüberliegenden Seite lüftet den Raum wirklich durch.</p>
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
        sceneSkyline: 'Frankfurt skyline',
        sceneRoomOne: 'Room, one window',
        sceneRoomCross: 'Cross ventilation',
        dropToDelete: 'Drag here to delete',
        helpTabBasic: 'In short',
        helpTabAdvanced: 'Technical details',
        hintDrag: 'Drag an obstacle onto the bin to delete it',
        helpAdvanced: `
            <p>What is being solved are the <strong>incompressible Navier-Stokes
            equations</strong> in two dimensions, using the <em>Stable Fluids</em> scheme
            (Jos Stam, 1999). Every frame runs four steps:</p>
            <ol>
              <li><strong>Inflow</strong>: in a narrow band at the inlet the velocity is pulled
              towards the free stream, and a sponge near the outlet swallows reflections.</li>
              <li><strong>Vorticity confinement</strong>: hands energy back to the small eddies
              that the coarse grid averages away.</li>
              <li><strong>Projection</strong>: compute the divergence, solve the pressure field
              from it, subtract the pressure gradient. This is the step that makes the flow
              source-free. It is solved with Jacobi iterations plus a correction on a four
              times coarser grid.</li>
              <li><strong>Advection</strong>: velocity and smoke are carried semi-Lagrangian,
              by tracing back along the flow.</li>
            </ol>
            <p>At medium quality the grid is about <strong>455 × 256 cells</strong>, while the smoke
            rides on a finer one of roughly 1820 × 1024. Every step is a fragment shader on
            the graphics card — some 10 million pixel evaluations per frame, entirely in the
            browser, with no server involved.</p>
            <p><strong>Obstacles</strong> live in a mask texture. At a solid face the normal
            velocity is reflected (making it zero on the wall), the pressure gets a Neumann
            condition, and the velocity inside is wiped — together a no-slip wall. The edge
            ramps over about one cell, because otherwise a diagonal wall acts as a staircase
            and sheds a little vortex at every step. Switching the wind on fills the whole
            field with the free stream at once, so no artificial starting front travels
            through the picture.</p>
            <h3>Where the model reaches its limits</h3>
            <ul>
              <li>The pressure equation is <strong>not converged to the last digit</strong>. A
              Jacobi sweep carries information only one cell, far too slow for large regions,
              so a correction runs on a coarser grid as well. That correction is what makes
              even a large room respect its mass balance. A little compressibility survives.</li>
              <li>The viscosity is <strong>numerical, not physical</strong>. There is no Reynolds
              number to set; the air and water presets only approximate the regime.</li>
              <li>Vorticity confinement is a <strong>trick</strong>, not a term of the equations. It
              adds energy to the field — too much of it makes the flow restless.</li>
              <li>Two dimensions are not three: in 2D vortices cannot stretch vortex lines, so
              energy travels towards large scales rather than small ones. Real turbulence
              behaves differently.</li>
            </ul>
            <p>In short: qualitatively right and made for playing with, but not an engineering
            simulation. If you need forces or pressure coefficients, use proper CFD.</p>`,
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
              move it, use the eraser to take it out again. The one outlined in blue
              is the selected one - size and rotation act on that.</li>
              <li><strong>Rotate</strong> an obstacle with the arrows below the tools,
              or with two fingers directly on it – two fingers resize it at the same
              time. On the airfoil, watch for the moment the flow separates.</li>
              <li>Under <strong>View</strong> you can colour the field by speed,
              vorticity or pressure instead of smoke.</li>
            </ol>
            <p>Try the two room scenes: with a single window almost nothing happens -
            the air has no way out. Only a second window on the opposite side really
            flushes the room through.</p>
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
