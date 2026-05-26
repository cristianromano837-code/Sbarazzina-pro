const socket = io();

socket.on("connect", () => {
    console.log("Collegato al server multiplayer:", socket.id);
});

let codiceStanza = "";
let nomePlayer = "";
let mioPlayerIndex = null;

/*
    Flusso corretto:
    - creaStanza(): il primo giocatore crea una nuova stanza con nome + codice.
    - entraStanza(): gli altri giocatori entrano in una stanza gia esistente.
*/

function leggiDatiStanza() {
    const inputCodice = document.getElementById("room-code");
    const inputNome = document.getElementById("player-name");

    const codice = inputCodice ? inputCodice.value.trim().toUpperCase() : "";
    const nome = inputNome ? inputNome.value.trim() : "";

    if (!nome) {
        alert("Scrivi il nome del giocatore");
        return null;
    }

    if (!codice) {
        alert("Scrivi un codice stanza");
        return null;
    }

    if (codice.length < 3) {
        alert("Il codice stanza deve avere almeno 3 caratteri");
        return null;
    }

    return { codice, nome };
}

function creaStanza() {
    const dati = leggiDatiStanza();

    if (!dati) {
        return;
    }

    codiceStanza = dati.codice;
    nomePlayer = dati.nome;

    socket.emit("crea-stanza", {
        codice: codiceStanza,
        nome: nomePlayer
    });
}

function entraStanza() {
    const dati = leggiDatiStanza();

    if (!dati) {
        return;
    }

    codiceStanza = dati.codice;
    nomePlayer = dati.nome;

    socket.emit("entra-stanza", {
        codice: codiceStanza,
        nome: nomePlayer
    });
}

socket.on("stanza-creata", stato => {
    const ov = document.getElementById("overlay-msg");

    if (ov) {
        ov.className = "small-message";
        ov.innerHTML = `
            <h2>Stanza creata</h2>
            <p>Codice: <strong>${stato.codice || codiceStanza}</strong></p>
            <p>Condividi questo codice con i tuoi amici.</p>
        `;
    }
});

socket.on("assegna-player", playerIndex => {
    mioPlayerIndex = playerIndex;
    alert("Sei il giocatore P" + (playerIndex + 1));
});

socket.on("stato-stanza", stato => {
    const roomStatus = document.getElementById("room-status");

    if (roomStatus) {
        roomStatus.innerText = `Stanza ${stato.codice}: ${stato.giocatoriConnessi}/4 giocatori`;
    }

    const ov = document.getElementById("overlay-msg");

    if (ov) {
        ov.className = "small-message";
        ov.innerHTML = `
            <h2>Stanza ${stato.codice}</h2>
            <p>Giocatori collegati: ${stato.giocatoriConnessi}/4</p>
        `;
    }
});

socket.on("errore", msg => {
    alert(msg);
});

let mazzo = [], tavola = [], mani = [[], [], [], []];
let mazziPrese = [[], []], sbarazzine = [0, 0], ultimoAPrendere = -1;
let turnoCorrente = 0, staAnimando = false, selezioneAttiva = false;
let carteSelezionate = [], cartaInSospeso = null;
let partenzaCartaInSospeso = null;

// Punteggio totale della partita fino a 31
let puntiPartita = [0, 0];

// Primo giocatore che tira nella mano corrente.
// 0 = Tu, 1 = P2, 2 = P3, 3 = P4
let primoDiMano = 0;

// Serve per il buon gioco: chi accusa tiene le carte scoperte fino a fine smazzata.
let buonGiocoScoperto = [false, false, false, false];

// Dimensioni singola carta nello sheet
const CW = 66;
const CH = 102;
const PUNTI_VITTORIA = 31;

function inizia() {
    puntiPartita = [0, 0];
    primoDiMano = 0;
    preparaNuovaMano();
}

function preparaNuovaMano() {
    mazzo = [];
    tavola = [];
    mani = [[], [], [], []];
    mazziPrese = [[], []];
    sbarazzine = [0, 0];
    ultimoAPrendere = -1;

    // Qui è la modifica importante:
    // il turno iniziale della mano è deciso da primoDiMano.
    turnoCorrente = primoDiMano;

    staAnimando = false;
    selezioneAttiva = false;
    carteSelezionate = [];
    cartaInSospeso = null;
    partenzaCartaInSospeso = null;
    buonGiocoScoperto = [false, false, false, false];

    const semi = ['Oro', 'Coppe', 'Spade', 'Bastoni'];

    for (let s of semi) {
        for (let v = 1; v <= 10; v++) {
            mazzo.push({ v, s });
        }
    }

    mazzo.sort(() => Math.random() - 0.5);

    tavola = mazzo.splice(0, 4);

    // Se tra le prime 4 carte c'è un asso, si rimescola
    while (tavola.some(c => c.v === 1)) {
        mazzo.push(...tavola);
        mazzo.sort(() => Math.random() - 0.5);
        tavola = mazzo.splice(0, 4);
    }

    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('overlay-msg').innerHTML = "";
    document.getElementById('overlay-msg').className = "";

    render();
    nuovaSmazzata();
}

async function prossimaMano() {
    // Finita una mano completa, il primo a tirare slitta di un posto.
    primoDiMano = (primoDiMano + 1) % 4;
    preparaNuovaMano();
}

async function nuovaSmazzata() {
    // Ogni nuova smazzata da 3 carte resetta il buon gioco scoperto
    buonGiocoScoperto = [false, false, false, false];

    for (let i = 0; i < 4; i++) {
        mani[i] = mazzo.splice(0, 3);
        await controllaAccusi(mani[i], i);
    }

    render();

    if (turnoCorrente !== 0) {
        gestisciTurniIA();
    }
}

async function controllaAccusi(mano, pIdx) {
    let squadra = squadraDi(pIdx);
    let v = mano.map(c => c.v).sort((a, b) => a - b);
    let somma = v[0] + v[1] + v[2];

    let pts = 0;
    let nome = "";

    if (v[0] === v[1] && v[1] === v[2]) {
        if (v[0] === 1) {
            pts = 11;
            nome = "3 ASSI";
        } else {
            pts = 7;
            nome = "TRIS";
        }
    } else if (somma <= 9) {
        if (v[0] === v[1] || v[1] === v[2]) {
            pts = 3;
            nome = "COPPIA SOTTO 9";
        } else {
            pts = 2;
            nome = "3 DIVERSE SOTTO 9";
        }
    }

    if (pts > 0) {
        buonGiocoScoperto[pIdx] = true;

        sbarazzine[squadra] += pts;
        aggiornaPunteggioSchermo();

        const ov = document.getElementById('overlay-msg');
        ov.className = "small-message";

        ov.innerHTML =
            `<h2 style="color:yellow">${nome}! (+${pts})</h2><div class="hand-row">` +
            mano.map(c => renderCartaHTML(c)).join('') +
            `</div>`;

        await aspetta(2300);

        ov.innerHTML = "";
        ov.className = "";

        render();
    }
}

function squadraDi(pIdx) {
    return (pIdx === 0 || pIdx === 2) ? 0 : 1;
}

function nomeGiocatore(pIdx) {
    if (pIdx === mioPlayerIndex) return nomePlayer || "Tu";
    if (pIdx === 1) return "P2";
    if (pIdx === 2) return "P3";
    return "P4";
}

function aspetta(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function renderCartaHTML(c, extraClass = "") {
    const semiIndice = {
        'Oro': 0,
        'Coppe': 1,
        'Spade': 2,
        'Bastoni': 3
    };

    const px = (c.v - 1) * -CW;
    const py = semiIndice[c.s] * -CH;

    return `<div class="card ${extraClass}" style="background-position: ${px}px ${py}px"></div>`;
}

function impostaGraficaCarta(el, carta) {
    const semiIndice = {
        'Oro': 0,
        'Coppe': 1,
        'Spade': 2,
        'Bastoni': 3
    };

    const px = (carta.v - 1) * -CW;
    const py = semiIndice[carta.s] * -CH;

    el.style.backgroundPosition = `${px}px ${py}px`;
}

function rectDaElemento(el) {
    const r = el.getBoundingClientRect();

    return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height
    };
}

function render() {
    const tDiv = document.getElementById('tavolo-carte');

    // Le carte sul tavolo sono sempre scoperte
    tDiv.innerHTML = tavola.map((c, i) => {
        let selClass = selezioneAttiva ? 'selectable' : '';
        return renderCartaHTML(c, `${selClass} t-card-${i}`);
    }).join('');

    if (selezioneAttiva) {
        tavola.forEach((c, i) => {
            let el = document.querySelector(`.t-card-${i}`);
            if (el) {
                el.onclick = () => gestisciClickTavolo(c, el);
            }
        });
    }

    for (let i = 0; i < 4; i++) {
        const area = document.getElementById(`pos-${['bottom', 'left', 'top', 'right'][i]}`);
        const hDiv = document.getElementById(`hand-${i}`);

        area.className = `player-area ${turnoCorrente === i ? 'active' : ''}`;
        hDiv.innerHTML = '';

        mani[i].forEach((c, idx) => {
            let cardHTML = document.createElement('div');

            // Tu vedi sempre le tue carte.
            // Gli altri giocatori mostrano le carte solo se hanno fatto buon gioco.
            if (i === 0 || buonGiocoScoperto[i]) {
                cardHTML.className = 'card';
                impostaGraficaCarta(cardHTML, c);

                if (i === 0) {
                    cardHTML.onclick = () => tentaGiocata(idx, cardHTML);
                }
            } else {
                cardHTML.className = 'card back';
            }

            hDiv.appendChild(cardHTML);
        });
    }

    aggiornaPunteggioSchermo();
}

function aggiornaPunteggioSchermo() {
    // Durante la mano mostriamo il totale partita + i punti fatti nella mano corrente.
    document.getElementById('pA').innerText = puntiPartita[0] + sbarazzine[0];
    document.getElementById('pB').innerText = puntiPartita[1] + sbarazzine[1];
}

async function tentaGiocata(idx, cartaEl) {
    if (turnoCorrente !== 0 || staAnimando || selezioneAttiva) {
        return;
    }

    partenzaCartaInSospeso = rectDaElemento(cartaEl);

    cartaInSospeso = mani[0].splice(idx, 1)[0];

    let combos = trovaTutteLeCombinazioni(tavola, cartaInSospeso.v);

    if (combos.length > 1) {
        selezioneAttiva = true;
        carteSelezionate = [];
        render();
    } else {
        render();

        await giocaCartaConAnimazione(
            cartaInSospeso,
            combos.length === 1 ? combos[0] : [],
            0,
            partenzaCartaInSospeso
        );

        cartaInSospeso = null;
        partenzaCartaInSospeso = null;
        concludiMossa();
    }
}

async function gestisciClickTavolo(carta, el) {
    if (staAnimando) {
        return;
    }

    if (carteSelezionate.includes(carta)) {
        carteSelezionate = carteSelezionate.filter(c => c !== carta);
        el.classList.remove('selected');
    } else {
        carteSelezionate.push(carta);
        el.classList.add('selected');
    }

    let sommaSelezionata = carteSelezionate.reduce((a, b) => a + b.v, 0);

    if (sommaSelezionata === cartaInSospeso.v) {
        selezioneAttiva = false;

        await giocaCartaConAnimazione(
            cartaInSospeso,
            [...carteSelezionate],
            0,
            partenzaCartaInSospeso
        );

        carteSelezionate = [];
        cartaInSospeso = null;
        partenzaCartaInSospeso = null;
        concludiMossa();
    }
}

async function gestisciTurniIA() {
    if (turnoCorrente === 0 || staAnimando) {
        return;
    }

    staAnimando = true;

    await aspetta(900);

    const hDiv = document.getElementById(`hand-${turnoCorrente}`);
    const cartaEl = hDiv ? hDiv.querySelector('.card') : null;

    let rectPartenza = cartaEl ? rectDaElemento(cartaEl) : rettangoloPartenzaGiocatore(turnoCorrente);

    let c = mani[turnoCorrente].splice(0, 1)[0];

    let combos = trovaTutteLeCombinazioni(tavola, c.v);

    render();

    await giocaCartaConAnimazione(
        c,
        combos.length > 0 ? combos[0] : [],
        turnoCorrente,
        rectPartenza
    );

    concludiMossa();
}

async function giocaCartaConAnimazione(carta, prese, pIdx, rectPartenza) {
    staAnimando = true;

    let preseEffettive = prese;

    if (carta.v === 1 && prese.length === 0 && tavola.length > 0) {
        preseEffettive = [...tavola];
    }

    await animaLancioCarta(carta, pIdx, rectPartenza);

    if (preseEffettive.length > 0) {
        await animaPrese(carta, preseEffettive, pIdx);
    }

    eseguiLogica(carta, prese, pIdx);
}

function rettangoloPartenzaGiocatore(pIdx) {
    const posizioni = ['bottom', 'left', 'top', 'right'];
    const area = document.getElementById(`pos-${posizioni[pIdx]}`);
    const r = area.getBoundingClientRect();

    return {
        left: r.left + r.width / 2 - CW / 2,
        top: r.top + r.height / 2 - CH / 2,
        width: CW,
        height: CH
    };
}

function rettangoloCentroTavolo() {
    const area = document.getElementById('center-area');
    const r = area.getBoundingClientRect();

    return {
        left: r.left + r.width / 2 - CW / 2,
        top: r.top + r.height / 2 - CH / 2,
        width: CW,
        height: CH
    };
}

function creaCartaVolante(carta, rect, classExtra = "") {
    let el = document.createElement('div');
    el.className = `card flying-card ${classExtra}`;
    impostaGraficaCarta(el, carta);

    el.style.left = rect.left + "px";
    el.style.top = rect.top + "px";
    el.style.width = CW + "px";
    el.style.height = CH + "px";

    document.body.appendChild(el);
    return el;
}

async function animaLancioCarta(carta, pIdx, rectPartenza) {
    const startRect = rectPartenza || rettangoloPartenzaGiocatore(pIdx);
    const endRect = rettangoloCentroTavolo();

    const volante = creaCartaVolante(carta, startRect, "throwing");

    await aspetta(30);

    volante.style.left = endRect.left + "px";
    volante.style.top = endRect.top + "px";
    volante.style.transform = "rotate(360deg) scale(1.08)";

    await aspetta(520);

    volante.remove();
}

async function animaPrese(cartaGiocata, prese, pIdx) {
    const squadra = squadraDi(pIdx);
    const destinazione = document.getElementById(squadra === 0 ? 'pos-bottom' : 'pos-right');
    const destRectOriginale = destinazione.getBoundingClientRect();

    const destRect = {
        left: destRectOriginale.left + destRectOriginale.width / 2 - CW / 2,
        top: destRectOriginale.top + destRectOriginale.height / 2 - CH / 2,
        width: CW,
        height: CH
    };

    let carteDaAnimare = [];

    carteDaAnimare.push({
        carta: cartaGiocata,
        rect: rettangoloCentroTavolo()
    });

    prese.forEach(cartaPresa => {
        let idx = tavola.indexOf(cartaPresa);
        let el = document.querySelector(`.t-card-${idx}`);

        if (el) {
            carteDaAnimare.push({
                carta: cartaPresa,
                rect: rectDaElemento(el)
            });
        }
    });

    let volanti = carteDaAnimare.map((item, i) => {
        let el = creaCartaVolante(item.carta, item.rect, "taking");
        el.style.transitionDelay = `${i * 60}ms`;
        return el;
    });

    await aspetta(40);

    volanti.forEach((el, i) => {
        el.style.left = destRect.left + "px";
        el.style.top = destRect.top + "px";
        el.style.transform = `scale(0.25) rotate(${i % 2 === 0 ? -25 : 25}deg)`;
        el.style.opacity = "0";
    });

    await aspetta(680);

    volanti.forEach(el => el.remove());
}

function concludiMossa() {
    staAnimando = false;

    turnoCorrente = (turnoCorrente + 1) % 4;

    render();

    if (mani.every(m => m.length === 0)) {
        if (mazzo.length > 0) {
            nuovaSmazzata();
        } else {
            calcolaPuntiFinali();
        }
    } else {
        if (turnoCorrente !== 0) {
            gestisciTurniIA();
        }
    }
}

function eseguiLogica(carta, prese, pIdx) {
    let squadra = squadraDi(pIdx);

    if (carta.v === 1 && prese.length === 0 && tavola.length > 0) {
        prese = [...tavola];

        mazziPrese[squadra].push(carta, ...prese);

        tavola = [];

        ultimoAPrendere = squadra;

        sbarazzine[squadra]++;
        aggiornaPunteggioSchermo();
    }

    else if (prese.length > 0) {
        tavola = tavola.filter(c => !prese.includes(c));

        mazziPrese[squadra].push(carta, ...prese);

        ultimoAPrendere = squadra;

        if (tavola.length === 0) {
            sbarazzine[squadra]++;
            aggiornaPunteggioSchermo();
        }
    }

    else {
        tavola.push(carta);
    }
}

function trovaTutteLeCombinazioni(cards, target) {
    let singola = cards.find(c => c.v === target);

    if (singola) {
        return [[singola]];
    }

    let ris = [];

    const f = (s, t, c) => {
        if (t === 0) {
            ris.push(c);
            return;
        }

        for (let i = s; i < cards.length; i++) {
            if (cards[i].v <= t) {
                f(i + 1, t - cards[i].v, [...c, cards[i]]);
            }
        }
    };

    f(0, target, []);

    return ris;
}

function valorePrimiera(carta) {
    if (carta.v === 7) return 21;
    if (carta.v === 6) return 18;
    if (carta.v === 1) return 16;
    if (carta.v === 5) return 15;
    if (carta.v === 4) return 14;
    if (carta.v === 3) return 13;
    if (carta.v === 2) return 12;
    return 10;
}

function calcolaPrimiera(manoPrese) {
    const semi = ['Oro', 'Coppe', 'Spade', 'Bastoni'];
    let totale = 0;

    for (let seme of semi) {
        let carteDelSeme = manoPrese.filter(c => c.s === seme);

        if (carteDelSeme.length === 0) {
            return 0;
        }

        let migliorValore = Math.max(...carteDelSeme.map(c => valorePrimiera(c)));
        totale += migliorValore;
    }

    return totale;
}

function aggiungiRiga(righe, voce, squadraA, squadraB) {
    righe.push({
        voce,
        squadraA,
        squadraB
    });
}

function calcolaPuntiFinali() {
    if (tavola.length > 0 && ultimoAPrendere !== -1) {
        mazziPrese[ultimoAPrendere].push(...tavola);
        tavola = [];
    }

    let puntiMano = [sbarazzine[0], sbarazzine[1]];

    let carteSquadraA = mazziPrese[0];
    let carteSquadraB = mazziPrese[1];

    let denariA = carteSquadraA.filter(c => c.s === 'Oro').length;
    let denariB = carteSquadraB.filter(c => c.s === 'Oro').length;

    let numeroCarteA = carteSquadraA.length;
    let numeroCarteB = carteSquadraB.length;

    let primieraA = calcolaPrimiera(carteSquadraA);
    let primieraB = calcolaPrimiera(carteSquadraB);

    let righe = [];

    aggiungiRiga(righe, "Carte prese", numeroCarteA, numeroCarteB);
    aggiungiRiga(righe, "Denari presi", denariA, denariB);
    aggiungiRiga(righe, "Primiera", primieraA, primieraB);
    aggiungiRiga(righe, "Sbarazzine / accusi", sbarazzine[0], sbarazzine[1]);

    let dieciDenariA = carteSquadraA.some(c => c.v === 10 && c.s === 'Oro') ? 1 : 0;
    let dieciDenariB = carteSquadraB.some(c => c.v === 10 && c.s === 'Oro') ? 1 : 0;

    puntiMano[0] += dieciDenariA;
    puntiMano[1] += dieciDenariB;

    aggiungiRiga(righe, "10 di denari", dieciDenariA ? "+1" : "0", dieciDenariB ? "+1" : "0");

    let setteDenariA = carteSquadraA.some(c => c.v === 7 && c.s === 'Oro') ? 1 : 0;
    let setteDenariB = carteSquadraB.some(c => c.v === 7 && c.s === 'Oro') ? 1 : 0;

    puntiMano[0] += setteDenariA;
    puntiMano[1] += setteDenariB;

    aggiungiRiga(righe, "7 di denari", setteDenariA ? "+1" : "0", setteDenariB ? "+1" : "0");

    let puntoDenariA = 0;
    let puntoDenariB = 0;

    if (denariA > 5) {
        puntoDenariA = 1;
        puntiMano[0]++;
    } else if (denariB > 5) {
        puntoDenariB = 1;
        puntiMano[1]++;
    }

    aggiungiRiga(
        righe,
        "Maggioranza denari",
        puntoDenariA ? `+1 (${denariA})` : "0",
        puntoDenariB ? `+1 (${denariB})` : "0"
    );

    let puntoCarteA = 0;
    let puntoCarteB = 0;

    if (numeroCarteA > 20) {
        puntoCarteA = 1;
        puntiMano[0]++;
    } else if (numeroCarteB > 20) {
        puntoCarteB = 1;
        puntiMano[1]++;
    }

    aggiungiRiga(
        righe,
        "Maggioranza carte",
        puntoCarteA ? `+1 (${numeroCarteA})` : "0",
        puntoCarteB ? `+1 (${numeroCarteB})` : "0"
    );

    let puntoPrimieraA = 0;
    let puntoPrimieraB = 0;

    if (primieraA > primieraB) {
        puntoPrimieraA = 1;
        puntiMano[0]++;
    } else if (primieraB > primieraA) {
        puntoPrimieraB = 1;
        puntiMano[1]++;
    }

    aggiungiRiga(
        righe,
        "Punto primiera",
        puntoPrimieraA ? `+1 (${primieraA})` : "0",
        puntoPrimieraB ? `+1 (${primieraB})` : "0"
    );

    let dueCoppeA = carteSquadraA.some(c => c.v === 2 && c.s === 'Coppe') ? -5 : 0;
    let dueCoppeB = carteSquadraB.some(c => c.v === 2 && c.s === 'Coppe') ? -5 : 0;

    puntiMano[0] += dueCoppeA;
    puntiMano[1] += dueCoppeB;

    aggiungiRiga(righe, "2 di coppe", dueCoppeA ? "-5" : "0", dueCoppeB ? "-5" : "0");

    aggiungiRiga(righe, "Punti mano", puntiMano[0], puntiMano[1]);

    puntiPartita[0] += puntiMano[0];
    puntiPartita[1] += puntiMano[1];

    aggiungiRiga(righe, "Totale partita", puntiPartita[0], puntiPartita[1]);

    aggiornaPunteggioSchermo();
    mostraTabellaFinale(righe, puntiMano);
}

function mostraTabellaFinale(righe, puntiMano) {
    const ov = document.getElementById('overlay-msg');
    ov.className = "results-overlay";

    let partitaFinita = puntiPartita[0] >= PUNTI_VITTORIA || puntiPartita[1] >= PUNTI_VITTORIA;

    let titolo = "Fine mano";
    let sottotitolo = `Prossimo primo a tirare: ${nomeGiocatore((primoDiMano + 1) % 4)}`;

    if (partitaFinita) {
        titolo = "Partita finita";

        if (puntiPartita[0] > puntiPartita[1]) {
            sottotitolo = "Vince Squadra A";
        } else if (puntiPartita[1] > puntiPartita[0]) {
            sottotitolo = "Vince Squadra B";
        } else {
            sottotitolo = "Pareggio";
        }
    }

    let righeHTML = righe.map(r => {
        let isTotale = r.voce === "Totale partita";

        return `
            <tr class="${isTotale ? 'total-row' : ''}">
                <td>${r.voce}</td>
                <td>${r.squadraA}</td>
                <td>${r.squadraB}</td>
            </tr>
        `;
    }).join('');

    let bottoneFinale = "";

    if (partitaFinita) {
        bottoneFinale = `<button class="close-results-btn" onclick="inizia()">Nuova partita</button>`;
    } else {
        bottoneFinale = `<button class="close-results-btn" onclick="prossimaMano()">Prossima mano</button>`;
    }

    ov.innerHTML = `
        <div class="results-card">
            <h1>${titolo}</h1>
            <h2>${sottotitolo}</h2>

            <table class="results-table">
                <thead>
                    <tr>
                        <th>Voce</th>
                        <th>Squadra A<br><span>Tu + Compagno</span></th>
                        <th>Squadra B<br><span>Avversari</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${righeHTML}
                </tbody>
            </table>

            ${bottoneFinale}
        </div>
    `;
}
function mostraPiantino() {
    const piantino = document.createElement("div");
    piantino.className = "piantino-emoji";
    piantino.innerText = "😭";

    document.body.appendChild(piantino);

    setTimeout(() => {
        piantino.remove();
    }, 1800);
}