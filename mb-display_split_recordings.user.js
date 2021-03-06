/* global $ */
'use strict';
// ==UserScript==
// @name         MusicBrainz: Show recordings of subworks on Work page
// @namespace    mbz-loujine
// @author       loujine
// @version      2020.9.14
// @downloadURL  https://raw.githubusercontent.com/loujine/musicbrainz-scripts/master/mb-display_split_recordings.user.js
// @updateURL    https://raw.githubusercontent.com/loujine/musicbrainz-scripts/master/mb-display_split_recordings.user.js
// @supportURL   https://github.com/loujine/musicbrainz-scripts
// @icon         https://raw.githubusercontent.com/loujine/musicbrainz-scripts/master/icon.png
// @description  musicbrainz.org: Show recordings of subworks on Work page
// @compatible   firefox+tampermonkey
// @license      MIT
// @include      http*://*musicbrainz.org/work/*
// @exclude      http*://*musicbrainz.org/work/*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

const delay = 1.1;
const counts = {};
window.counts = counts;
const uniques = [];
const offset = [];
window.offset = offset;
let nbSubworks;

// musicbrainz-server/root/static/scripts/common/utility/formatTrackLength.js
function formatTrackLength(milliseconds) {
    if (!milliseconds) {
        return '';
    }
    if (milliseconds < 1000) {
        return milliseconds + ' ms';
    }
    const oneMinute = 60;
    const oneHour = 60 * oneMinute;
    let seconds = Math.round(milliseconds / 1000.0);
    const hours = Math.floor(seconds / oneHour);
    seconds %= oneHour;
    const minutes = Math.floor(seconds / oneMinute);
    seconds %= oneMinute;
    let result = ('00' + seconds).slice(-2);
    if (hours > 0) {
        result = hours + ':' + ('00' + minutes).slice(-2) + ':' + result;
    } else {
        result = minutes + ':' + result;
    }
    return result;
}

function formatDate(begin, end) {
    if (begin === null && end === null) {
        return '';
    }
    if (begin === end) {
        return begin;
    }
    return `${begin} – ${end}`;
}

function fetchRelatedRecordings(mbid, props) {
    // wsUrl
    fetch(`/ws/2/recording/${mbid}?fmt=json&inc=artist-rels releases`).then(
        resp => resp.json()
    ).then(json => {
        if (
            json.relations == undefined || json.relations.length === 0 || json.releases.length === 0
        ) {
            return;
        }
        const rels = json.relations.filter(
            rel => ['instrument', 'vocal', 'orchestra', 'conductor'].includes(rel.type)
        );
        if (rels.length === 0) {
            return;
        }
        for (const rel of json.releases) {
            counts[rel.id] = counts[rel.id] || [];
            props['artists'] = rels.map(rel => rel.artist.name).join(', ');
            counts[rel.id].push(props);
        }
    })
}

function fetchSubWorks(mbid, swidx) {
    // wsUrl
    fetch(`/ws/2/work/${mbid}?fmt=json&inc=recording-rels`).then(
        resp => resp.json()
    ).then(json => {
        if (!json.relations || json.relations.length === 0) {
            return;
        }
        console.log(`${json.relations.length} recordings for subwork no. ${swidx}`);
        offset.push(json.relations.length);
        for (const [idx, recrel] of json.relations.entries()) {
            const rec = recrel.recording;
            setTimeout(() => {
                // console.log(idx, 'Recording title:', rec.title);
                fetchRelatedRecordings(rec.id, {
                    mbid: rec.id,
                    title: rec.title,
                    duration: rec.length,
                    begin: recrel.begin,
                    end: recrel.end,
                });
            }, 1000 * delay * (idx + offset.slice().splice(0, swidx).reduce((a,b) => a+b, 0)));
        }
    })
}

function fetchWork(mbid) {
    // wsUrl
    fetch(`/ws/2/work/${mbid}?fmt=json&inc=work-rels`).then(
        resp => resp.json()
    ).then(json => {
        const rels = json.relations.filter(
            rel => rel.type === 'parts' && rel.direction === 'forward'
        );
        nbSubworks = rels.length;
        console.log(`${nbSubworks} subworks`);
        offset.push(nbSubworks);
        for (const subwrel of rels) {
            const subw = subwrel.work;
            const subwidx = subwrel['ordering-key'];
            setTimeout(() => {
                // console.log(subwidx, 'SubWork title:', subw.title);
                fetchSubWorks(subw.id, subwidx);
            }, 1000 * delay * (subwidx - 1));
        }
    }).then(() => {
        $('table:last').after(`
            <table class="tbl">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Title</th>
                        <th>Artist</th>
                        <th>Length</th>
                    </tr>
                </thead>
                <tbody id="split">
                    <tr class="subh">
                        <th></th>
                        <th colspan="3">performance</th>
                    </tr>
            `).after('<h2>Recordings split by subworks</h2>');
        $('#split').parent().after($(
            `<p id="tmpSubworks">Loading ${nbSubworks} subworks (it should take
            around ${Number.parseInt(nbSubworks * delay)} seconds)</p>`
        ))
        setTimeout(() => {
            // the first delay is required so that we can compute the real delay
            // required
            // at this stage we should know how many recordings in total we have
            // to load
            const nbRecordings = offset.slice().splice(1).reduce((a,b) => a+b, 0);
            $('#tmpSubworks').empty().text(
                `Loading ${nbRecordings} recordings (it should take
                around ${Number.parseInt(nbRecordings * delay)} seconds)`
            );
            setTimeout(() => {
                $('#tmpSubworks').remove();
                for (const [mbid, ar] of Object.entries(counts)) { // eslint-disable-line no-unused-vars
                    if (ar.length == nbSubworks && !uniques.includes(ar[0].mbid)) {
                        const {begin, end, artists} = ar[0];
                        $('#split').append($(
                            `<tr>
                                <td>${formatDate(begin, end)}</td>
                                <td></td>
                                <td>${artists}</td>
                                <td>${
                                    formatTrackLength(
                                        ar.map(obj => obj.duration
                                    ).reduce((a,b) => a+b, 0))}
                                </td>
                            </tr>`));
                        for (const {mbid, title, artists, duration} of ar) {
                            $('#split').append($(
                                `<tr>
                                <td></td>
                                <td><a href="/recording/${mbid}">${title}</a></td>
                                <td>${artists}</td>
                                <td>${formatTrackLength(duration)}</td>
                                </tr>`))
                        }
                        $('#split').append($('<tr><th colspan="4"></th></tr>'));
                        uniques.push(ar[0].mbid);
                    }
                }
            }, 1000 * delay * offset.reduce((a,b) => a+b, 0))
        }, 1000 * delay * nbSubworks);
    });
}

(function () {
    $('table:last').after(
        $('<input>', {
            'id': 'displaySubworkRecordings',
            'type': 'button',
            'value': 'Display recordings split by subworks',
        })
    );
})();

$(document).ready(function () {
    // const work = helper.mbidFromURL();
    const mbid = document.URL.split('/')[4];
    $('#displaySubworkRecordings').click(() => {
        $('#displaySubworkRecordings').remove();
        fetchWork(mbid);
    });
    return false;
});
