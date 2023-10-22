const express = require('express');
const bodyParser = require('body-parser');
const superagent  = require('superagent');
const cheerio = require('cheerio');

const port = 3000;
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/login', async (req, result) => {
    var username = req.body.uid;
    var password = req.body.pwd;
    
    // data to send to the website to login check on spiaggiari's website
    const data = {
        cid: "",
        uid: username,
        pwd: password,
        pid: "",
        target: ""
    }
    
    // this function login to the website and return the phpsessid cookie
    async function login(data) {
        let sessid;
        try {
            
            const res = await superagent.post("https://web.spaggiari.eu/auth-p7/app/default/AuthApi4.php?a=aLoginPwd")
            .send(data)
            .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
            .end((err, res) => {
                if (err) {
                    console.log(err);
                    return "null";
                } else {
                    const cookies = res.headers['set-cookie'][1].split(',').map(item => item.split(';')[0]);
                    sessid = cookies[0].substring(10);
                    result.send(sessid);
                }
            });
  
        } catch (err) {
            console.error(err);
            return "null";
        }
        return sessid;
    }

    const sessid = await login(data);
    return sessid;
    
});

// return all the user's grades
app.post('/getGrades', async (req, res) => {
    var sessid = req.body.sessid;
    
    // request from the website to get html page. 
    // login is managed by phpsessid cookie
    const response = await superagent.get("https://web.spaggiari.eu/cvv/app/default/genitori_note.php?ordine=data&filtro=tutto")
    .set('Cookie', `PHPSESSID=${sessid}`)
    .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    .send({ key: 'value' });

    // load html page and get all the grades, subjects and comments
    const $ = cheerio.load(response.text);
    const voti = $('.s_reg_testo');
    const materie = $('span.voto_data');
    const commenti = $('.griglia_sep_darkgray_top>div>span')
    let count = 0;
    let listMaterie = [];
    let tipoLogia = [];
    // select all the subjects and put them in an array and the same for the type of grade (oral, written, etc.)
    materie.each((i, el) => {

        if((count % 2) == 0) {
            listMaterie.push($(el).text());
        } else {
            tipoLogia.push($(el).text());
        }
        count = count +1;
        
    });

    // create an array of objects with the grades, subjects and comments
    const data = [];
    voti.each((i, el) => {
        data.push({
            voto: $(el).text().replace("\n", "").replace("\n", "").replace(" ", ""),
            materia: listMaterie[i],
            commento: $(commenti[i]).text(),
            tipologia: tipoLogia[i].replace("<br>", " ")
        });
    });
    
    
    res.send(data);


    
});

app.post('/getToday', async (req, res) => {
    const sessid = req.body.sessid;

    const response = await superagent.get("https://web.spaggiari.eu/fml/app/default/regclasse.php")
    .set('Cookie', `PHPSESSID=${sessid}`)
    .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    .send({ key: 'value' });

    const $ = cheerio.load(response.text);
    // get the state of the lesson (present, absent, etc.). 
    // the reason why [3] could be explained by
    // [ '', 'P', '', 'presente', '', '', '' ]
    const stato = $('#sfondocella_11504897>p.s_reg_testo').text().split(" ")[3];
    const docenti = $('.registro_firma_dett_docente>div');
    const ora = $('.registro_firma_dett_ora');
    const materia = $('.registro_firma_dett_materia>span');
    const lezione = $('.registro_firma_dett_argomento_nota');

    const data = [];
    ora.each((i, el) => {
        data.push({
            ora: $(el).text().replace("\n", "").replace(" (1)\n", ""),
            materia: $(materia[i]).text().trim(),
            docente: $(docenti[i]).text(),
            lezione: $(lezione[i]).text(),
            stato: stato.toUpperCase()
        });
    });
    res.send(data);
});

// this function return all the user's communications and alters from "bacheca" section.
app.post('/getCircolari', async (req, result) => {
    const sessid = req.body.sessid;

    // this data are sent tp website below to make a post request to their servers
    const data = {
        action: "get_comunicazioni",
        cerca: "",
        ncna: "1",
        tipo_com: ""
    }

    // setting the website, sending the data, settng the cookie and getting the response
    const response = await superagent.post('https://web.spaggiari.eu/sif/app/default/bacheca_personale.php')
    .send(data)
    .set('Cookie', `PHPSESSID=${sessid}`)
    .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    .end((err, res) => {
        if (err) {
            console.log(err);
            return "null";
        } else {
            const circolari = res.text;
            result.send(circolari);
        }
    });

});

// this function return all the communication's documents.
// it provides a specific link per document. 
// by pressing the link, the document is automatacally downloaded
app.post('/getDocumenti', async (req, res) => {
    const sessid = req.body.sessid;
    // you can get this id by the function /getCircolari. 
    // in the response, you'll see lots of communications with their id
    const idCircolare = req.body.idCircolare;

    const response = await superagent.get(`https://web.spaggiari.eu/sif/app/default/bacheca_comunicazione.php?action=risposta_com&com_id=${idCircolare}`)
    .set('Cookie', `PHPSESSID=${sessid}`)
    .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    .send({ key: 'value' });

    const $ = cheerio.load(response.text);
    const urls = [];
    const doc = $('.dwl_allegato').each((i, el) => {
        urls.push("https://web.spaggiari.eu/sif/app/default/bacheca_personale.php?action=file_download&com_id=" + $(el).attr('allegato_id'));
        
    });

    
    res.send(urls);
});

// this function return all the user's notes
app.post('/getNote', async (req, res) => {
    const sessid = req.body.sessid;

    const response = await superagent.get("https://web.spaggiari.eu/fml/app/default/gioprof_note_studente.php")
    .set('Cookie', `PHPSESSID=${sessid}`)
    .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    .send({ key: 'value' });

    const $ = cheerio.load(response.text);
    const note = $('#sort_table>tbody>tr');

    const noteData = [];

    note.each((i, el) => {
        noteData.push({
            data: $(el).text().split("\n")[5],
            tipo: $(el).text().split("\n")[11],
            descrizione: $(el).text().split("\n")[8],
            docente: $(el).text().split("\n")[2]
        });
    }); 

    res.send(noteData);

});

// this function return all the subject name, subject ids and teacher ids. 
// this ids are usefull to take the arguments of the lessons
app.post("/getLezioni", async (req, res) => {
    const sessid = req.body.sessid;

    const response = await superagent.get('https://web.spaggiari.eu/fml/app/default/regclasse_lezioni_xstudenti.php')
    .set('Cookie', `PHPSESSID=${sessid}`)
    .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    .send({ key: 'value' });

    const $ = cheerio.load(response.text);
    const takeMaterieDivs = $('.materia');
    const listMaterie = [];

    takeMaterieDivs.each((i, el) => {
        listMaterie.push({
            materia: $(el).text().trim(),
            materia_id: $(el).attr("materia_id"),
            autori_id: $(el).attr("autori_id")
        });
    });

    console.log(listMaterie);
    res.send(listMaterie);
});

// this function return the user's class id
// this is usefull to get the howeworks or the tests scheduled
app.post("/getClasseid", async (req, res) => {
    const sessid = req.body.sessid;

    const response = await superagent.get("https://web.spaggiari.eu/fml/app/default/agenda_studenti.php")
    .set('Cookie', `PHPSESSID=${sessid}`)
    .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    .send({ key: 'value' });

    const $ = cheerio.load(response.text);
    const classeId = $('head script').text().match(/var classe_id_page = (.+);/)[1];

    res.send(classeId);

});

// this function return all the homeworks and test details scheduled from teachers
app.post("/getAgenda", async (req, result) => {
    const sessid = req.body.sessid;
    // you can get this classId from the function /getClasseid
    const classeId = req.body.classeId;
    // this date is the start date of the school year in seconds (1/9/2023)
    const start = "1693526400";
    const date = new Date();

    const dataAdesso = {
        dd: date.getDate(),
        mm: date.getMonth() + 1,
        yy: date.getFullYear()
    }

    const dataAdessoSecondi = Math.floor((new Date(dataAdesso.yy, dataAdesso.mm, dataAdesso.dd).getTime()) / 1000);
    const dataAdessoSecondiString = dataAdessoSecondi.toString();
    const dataAdessoSecondiString2 = dataAdessoSecondiString.substring(0, dataAdessoSecondiString.length - 2);
    const dataFine = dataAdessoSecondiString2 + "00";


    const data = {
        classe_id: classeId,
        gruppo_id: "",
        nascondi_av: "",
        start: start,
        end: dataFine
    }

    const response = await superagent.post("https://web.spaggiari.eu/fml/app/default/agenda_studenti.php?ope=get_events")
    .send(data)
    .set('Cookie', `PHPSESSID=${sessid}`)
    .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
    .end((err, res) => {
        if (err) {
            console.log(err);
            return "null";
        } else {
            const agenda = res.text;
            result.send(agenda);
        }
    });
    
    
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));