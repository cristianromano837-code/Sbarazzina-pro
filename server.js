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

function pulisciDatiStanza(dati) {
    const codice = String(dati.codice || "").trim().toUpperCase();
    const nome = String(dati.nome || "").trim();

    return { codice, nome };
}

function inviaStatoStanza(codice) {
    const stanza = stanze[codice];

    if (!stanza) {
        return;
    }

    io.to(codice).emit("stato-stanza", {
        codice: codice,
        giocatoriConnessi: stanza.giocatori.length,
        giocatori: stanza.giocatori.map(g => ({
            playerIndex: g.playerIndex,
            nome: g.nome
        }))
    });
}

function aggiungiGiocatoreAllaStanza(socket, codice, nome) {
    const stanza = stanze[codice];

    if (!stanza) {
        socket.emit("errore", "Questa stanza non esiste");
        return;
    }

    if (stanza.giocatori.length >= 4) {
        socket.emit("errore", "La stanza è piena");
        return;
    }

    const giaDentro = stanza.giocatori.some(g => g.socketId === socket.id);

    if (giaDentro) {
        socket.emit("errore", "Sei già dentro questa stanza");
        return;
    }

    const playerIndex = stanza.giocatori.length;

    stanza.giocatori.push({
        socketId: socket.id,
        playerIndex: playerIndex,
        nome: nome
    });

    socket.join(codice);

    socket.emit("assegna-player", playerIndex);

    inviaStatoStanza(codice);

    console.log(`Giocatore ${nome} P${playerIndex + 1} entrato nella stanza ${codice}`);
}

io.on("connection", socket => {
    console.log("Un giocatore si è collegato:", socket.id);

    socket.on("crea-stanza", dati => {
        console.log("RICHIESTA CREA STANZA:", dati);

        const { codice, nome } = pulisciDatiStanza(dati);

        if (!nome) {
            socket.emit("errore", "Inserisci il nome del giocatore");
            return;
        }

        if (!codice) {
            socket.emit("errore", "Inserisci un codice stanza");
            return;
        }

        if (codice.length < 3) {
            socket.emit("errore", "Il codice stanza deve avere almeno 3 caratteri");
            return;
        }

        if (stanze[codice]) {
            socket.emit("errore", "Questa stanza esiste già. Usa un altro codice oppure entra nella stanza.");
            return;
        }

        stanze[codice] = {
            codice: codice,
            giocatori: []
        };

        socket.emit("stanza-creata", {
            codice: codice
        });

        aggiungiGiocatoreAllaStanza(socket, codice, nome);

        console.log(`Stanza ${codice} creata da ${nome}`);
    });

    socket.on("entra-stanza", dati => {
        console.log("RICHIESTA ENTRA STANZA:", dati);

        const { codice, nome } = pulisciDatiStanza(dati);

        if (!nome) {
            socket.emit("errore", "Inserisci il nome del giocatore");
            return;
        }

        if (!codice) {
            socket.emit("errore", "Inserisci un codice stanza");
            return;
        }

        if (!stanze[codice]) {
            socket.emit("errore", "Questa stanza non esiste. Prima deve essere creata.");
            return;
        }

        aggiungiGiocatoreAllaStanza(socket, codice, nome);
    });

    socket.on("disconnect", () => {
        console.log("Un giocatore si è scollegato:", socket.id);

        for (const codice in stanze) {
            const stanza = stanze[codice];

            const numeroGiocatoriPrima = stanza.giocatori.length;

            stanza.giocatori = stanza.giocatori.filter(g => g.socketId !== socket.id);

            const numeroGiocatoriDopo = stanza.giocatori.length;

            if (numeroGiocatoriPrima !== numeroGiocatoriDopo) {
                inviaStatoStanza(codice);
            }

            if (stanza.giocatori.length === 0) {
                delete stanze[codice];
                console.log(`Stanza ${codice} eliminata perché vuota`);
            }
        }
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("Server avviato sulla porta " + PORT);
});