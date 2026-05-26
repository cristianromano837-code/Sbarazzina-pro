const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const cartellaGioco = path.join(__dirname, "public");

console.log("Cartella progetto:", __dirname);
console.log("Cartella gioco:", cartellaGioco);

if (fs.existsSync(cartellaGioco)) {
    console.log("File dentro public:", fs.readdirSync(cartellaGioco));
} else {
    console.log("ERRORE: la cartella public non esiste");
}

app.use(express.static(cartellaGioco));

app.get("/", (req, res) => {
    const indexPath = path.join(cartellaGioco, "index.html");

    if (!fs.existsSync(indexPath)) {
        res.status(404).send(`
            <h1>index.html non trovato</h1>
            <p>Node sta cercando qui:</p>
            <pre>${indexPath}</pre>
            <p>Controlla che index.html sia dentro la cartella public.</p>
        `);
        return;
    }

    res.sendFile(indexPath);
});

const PORT = process.env.PORT || 3000;

const stanze = {};

function normalizzaCodiceStanza(valore) {
    return String(valore || "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function normalizzaMassimoGiocatori(valore) {
    const numero = Number(valore);

    if (numero === 2 || numero === 3 || numero === 4) {
        return numero;
    }

    return 4;
}

function pulisciDatiStanza(dati = {}) {
    const codice = normalizzaCodiceStanza(
        dati.codice || dati.stanza || dati.room || ""
    );

    const nome = String(
        dati.nome || dati.playerName || ""
    ).trim();

    const massimoGiocatori = normalizzaMassimoGiocatori(
        dati.massimoGiocatori ||
        dati.maxPlayers ||
        dati.numeroGiocatori ||
        dati.players ||
        4
    );

    return { codice, nome, massimoGiocatori };
}

function giocatoriPuliti(stanza) {
    return stanza.giocatori.map(g => ({
        socketId: g.socketId,
        playerIndex: g.playerIndex,
        nome: g.nome,
        squadra: g.squadra,
        online: true
    }));
}

function calcolaSquadre(stanza) {
    if (!stanza) {
        return {
            squadraA: [],
            squadraB: []
        };
    }

    const massimoGiocatori = stanza.massimoGiocatori || 4;

    /*
        Modalità 2 giocatori:
        P1 contro P2
    */
    if (massimoGiocatori === 2) {
        stanza.giocatori.forEach(g => {
            g.squadra = g.playerIndex === 0 ? 0 : 1;
        });

        stanza.squadre = {
            squadraA: [0],
            squadraB: [1]
        };

        return stanza.squadre;
    }

    /*
        Modalità 3 giocatori:
        P1 da solo contro P2 + P3.
        È la soluzione più semplice senza riscrivere tutto il motore.
    */
    if (massimoGiocatori === 3) {
        stanza.giocatori.forEach(g => {
            g.squadra = g.playerIndex === 0 ? 0 : 1;
        });

        stanza.squadre = {
            squadraA: [0],
            squadraB: [1, 2]
        };

        return stanza.squadre;
    }

    /*
        Modalità 4 giocatori:
        P1 sceglie il compagno.
        Se non sceglie nessuno, default P1 + P3 contro P2 + P4.
    */
    let compagno = stanza.compagnoScelto;

    if (
        compagno === null ||
        compagno === undefined ||
        compagno === 0 ||
        !stanza.giocatori.some(g => g.playerIndex === compagno)
    ) {
        compagno = 2;
    }

    const squadraA = [0, compagno];
    const squadraB = [0, 1, 2, 3].filter(i => !squadraA.includes(i));

    stanza.giocatori.forEach(g => {
        if (squadraA.includes(g.playerIndex)) {
            g.squadra = 0;
        } else {
            g.squadra = 1;
        }
    });

    stanza.squadre = {
        squadraA,
        squadraB
    };

    return stanza.squadre;
}

function creaDatiStanza(codice) {
    const stanza = stanze[codice];

    if (!stanza) {
        return null;
    }

    const squadre = calcolaSquadre(stanza);

    return {
        codice: codice,
        giocatoriConnessi: stanza.giocatori.length,
        massimoGiocatori: stanza.massimoGiocatori,
        partitaIniziata: stanza.partitaIniziata,
        creatorePlayerIndex: 0,
        compagnoScelto: stanza.compagnoScelto,
        squadre: squadre,
        giocatori: giocatoriPuliti(stanza)
    };
}

function inviaStatoStanza(codice) {
    const dati = creaDatiStanza(codice);

    if (!dati) {
        return;
    }

    io.to(codice).emit("stato-stanza", dati);
}

function avviaPartitaSeStanzaPiena(codice) {
    const stanza = stanze[codice];

    if (!stanza) {
        return;
    }

    if (stanza.partitaIniziata) {
        return;
    }

    if (stanza.giocatori.length < stanza.massimoGiocatori) {
        return;
    }

    stanza.partitaIniziata = true;

    const datiPartita = creaDatiStanza(codice);

    io.to(codice).emit("stato-stanza", datiPartita);

    io.to(codice).emit("partita-iniziata", datiPartita);
    io.to(codice).emit("start-partita", datiPartita);
    io.to(codice).emit("game-started", datiPartita);

    console.log(
        `Partita avviata nella stanza ${codice} con ${stanza.giocatori.length}/${stanza.massimoGiocatori} giocatori`
    );
}

function aggiungiGiocatoreAllaStanza(socket, codice, nome) {
    const stanza = stanze[codice];

    if (!stanza) {
        socket.emit("errore", "Questa stanza non esiste");
        return;
    }

    if (stanza.partitaIniziata) {
        socket.emit("errore", "La partita è già iniziata in questa stanza");
        return;
    }

    if (stanza.giocatori.length >= stanza.massimoGiocatori) {
        socket.emit("errore", "La stanza è piena");
        return;
    }

    const giaDentro = stanza.giocatori.some(g => g.socketId === socket.id);

    if (giaDentro) {
        socket.emit("errore", "Sei già dentro questa stanza");
        return;
    }

    const playerIndex = stanza.giocatori.length;

    const nuovoGiocatore = {
        socketId: socket.id,
        playerIndex: playerIndex,
        nome: nome,
        squadra: null
    };

    stanza.giocatori.push(nuovoGiocatore);

    socket.join(codice);

    socket.data.codiceStanza = codice;
    socket.data.playerIndex = playerIndex;
    socket.data.nome = nome;

    socket.emit("assegna-player", playerIndex);

    socket.emit("entrato-stanza", {
        codice: codice,
        playerIndex: playerIndex,
        nome: nome,
        giocatoriConnessi: stanza.giocatori.length,
        massimoGiocatori: stanza.massimoGiocatori,
        giocatori: giocatoriPuliti(stanza),
        squadre: calcolaSquadre(stanza),
        compagnoScelto: stanza.compagnoScelto,
        partitaIniziata: stanza.partitaIniziata
    });

    inviaStatoStanza(codice);

    console.log(
        `Giocatore ${nome} P${playerIndex + 1} entrato nella stanza ${codice} (${stanza.giocatori.length}/${stanza.massimoGiocatori})`
    );

    avviaPartitaSeStanzaPiena(codice);
}

function rimuoviGiocatoreDaStanza(socket) {
    const codice = socket.data.codiceStanza;

    if (!codice || !stanze[codice]) {
        return;
    }

    const stanza = stanze[codice];

    const numeroGiocatoriPrima = stanza.giocatori.length;

    stanza.giocatori = stanza.giocatori.filter(g => g.socketId !== socket.id);

    const numeroGiocatoriDopo = stanza.giocatori.length;

    if (numeroGiocatoriPrima !== numeroGiocatoriDopo) {
        console.log(`Giocatore uscito dalla stanza ${codice}`);

        if (stanza.giocatori.length === 0) {
            delete stanze[codice];
            console.log(`Stanza ${codice} eliminata perché vuota`);
            return;
        }

        /*
            Se qualcuno esce, fermiamo lo stato partita.
            Così la stanza può tornare in attesa.
        */
        stanza.partitaIniziata = false;

        stanza.giocatori.forEach((g, index) => {
            g.playerIndex = index;
        });

        if (
            stanza.compagnoScelto !== null &&
            stanza.compagnoScelto !== undefined &&
            !stanza.giocatori.some(g => g.playerIndex === stanza.compagnoScelto)
        ) {
            stanza.compagnoScelto = null;
        }

        inviaStatoStanza(codice);
    }
}

io.on("connection", socket => {
    console.log("Un giocatore si è collegato:", socket.id);

    socket.on("crea-stanza", dati => {
        console.log("RICHIESTA CREA STANZA:", dati);

        const { codice, nome, massimoGiocatori } = pulisciDatiStanza(dati);

        if (!nome) {
            socket.emit("errore", "Inserisci il nome del giocatore");
            return;
        }

        if (!codice) {
            socket.emit("errore", "Inserisci il nome della stanza");
            return;
        }

        if (codice.length < 2) {
            socket.emit("errore", "Il nome stanza deve avere almeno 2 caratteri");
            return;
        }

        if (stanze[codice]) {
            socket.emit("errore", "Questa stanza esiste già. Usa Partecipa a stanza.");
            return;
        }

        stanze[codice] = {
            codice: codice,
            giocatori: [],
            massimoGiocatori: massimoGiocatori,
            partitaIniziata: false,
            compagnoScelto: null,
            squadre: {
                squadraA: [],
                squadraB: []
            }
        };

        socket.emit("stanza-creata", {
            codice: codice,
            giocatoriConnessi: 0,
            massimoGiocatori: massimoGiocatori,
            partitaIniziata: false
        });

        aggiungiGiocatoreAllaStanza(socket, codice, nome);

        console.log(`Stanza ${codice} creata da ${nome} per ${massimoGiocatori} giocatori`);
    });

    socket.on("entra-stanza", dati => {
        console.log("RICHIESTA ENTRA STANZA:", dati);

        const { codice, nome } = pulisciDatiStanza(dati);

        if (!nome) {
            socket.emit("errore", "Inserisci il nome del giocatore");
            return;
        }

        if (!codice) {
            socket.emit("errore", "Inserisci il nome della stanza");
            return;
        }

        if (!stanze[codice]) {
            socket.emit("errore", "Questa stanza non esiste. Prima deve essere creata.");
            return;
        }

        aggiungiGiocatoreAllaStanza(socket, codice, nome);
    });

    socket.on("scegli-compagno", dati => {
        const codice = socket.data.codiceStanza;

        if (!codice || !stanze[codice]) {
            socket.emit("errore", "Non sei dentro una stanza");
            return;
        }

        const stanza = stanze[codice];

        if (stanza.massimoGiocatori !== 4) {
            socket.emit("errore", "La scelta del compagno è disponibile solo nelle partite a 4 giocatori");
            return;
        }

        if (socket.data.playerIndex !== 0) {
            socket.emit("errore", "Solo il creatore della stanza può scegliere il compagno");
            return;
        }

        const compagnoIndex = Number(
            dati && (
                dati.playerIndex !== undefined
                    ? dati.playerIndex
                    : dati.compagnoIndex
            )
        );

        if (!Number.isInteger(compagnoIndex)) {
            socket.emit("errore", "Compagno non valido");
            return;
        }

        if (compagnoIndex === 0) {
            socket.emit("errore", "Non puoi scegliere te stesso come compagno");
            return;
        }

        if (compagnoIndex < 1 || compagnoIndex > 3) {
            socket.emit("errore", "Puoi scegliere solo P2, P3 o P4");
            return;
        }

        const esiste = stanza.giocatori.some(g => g.playerIndex === compagnoIndex);

        if (!esiste) {
            socket.emit("errore", "Questo giocatore non è ancora entrato");
            return;
        }

        stanza.compagnoScelto = compagnoIndex;

        const squadre = calcolaSquadre(stanza);

        io.to(codice).emit("squadre-aggiornate", {
            codice: codice,
            compagnoScelto: stanza.compagnoScelto,
            squadre: squadre,
            giocatori: giocatoriPuliti(stanza),
            massimoGiocatori: stanza.massimoGiocatori,
            partitaIniziata: stanza.partitaIniziata
        });

        inviaStatoStanza(codice);

        console.log(`Nella stanza ${codice}, P1 ha scelto P${compagnoIndex + 1} come compagno`);
    });

    socket.on("piantino", () => {
        const codice = socket.data.codiceStanza;

        if (!codice || !stanze[codice]) {
            socket.emit("mostra-piantino", {
                nome: socket.data.nome || "Giocatore"
            });
            return;
        }

        io.to(codice).emit("mostra-piantino", {
            codice: codice,
            playerIndex: socket.data.playerIndex,
            nome: socket.data.nome || "Giocatore"
        });

        console.log(`Piantino mandato nella stanza ${codice} da ${socket.data.nome}`);
    });

    socket.on("disconnect", () => {
        console.log("Un giocatore si è scollegato:", socket.id);
        rimuoviGiocatoreDaStanza(socket);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("Server avviato sulla porta " + PORT);
});
