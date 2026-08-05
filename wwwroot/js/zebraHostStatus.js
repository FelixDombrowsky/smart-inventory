// zebraHostStatus.js — parse & render Zebra "~HS" rawHostStatus string (25 comma-separated fields, b1–b25)
// อ้างอิง field-by-field ตาม docs/zebra_hs_status_reference.md — ใช้กับ field "rawHostStatus" ที่ /printer/status/{ip}/{port} คืนมา

const ZEBRA_PRINT_MODE_MAP = {
    0: 'Rewind', 1: 'Peel-Off', 2: 'Tear-Off', 3: 'Cutter', 4: 'Applicator',
    5: 'Delayed Cutter', 6: 'Linerless Peel', 7: 'Linerless Rewind',
    8: 'Partial Cutter', 9: 'RFID', 10: 'Kiosk', 11: 'Linerless Cutter',
    12: 'Linerless Delayed Cutter',
}

// 3 บรรทัด (คั่นด้วย \r\n) รวม 25 field คั่นด้วย comma — \r\n แค่ตัดกลุ่ม field ให้อ่านง่าย ไม่ใช่ตัวคั่นค่าจริง
// รวมเป็น token เดียวก่อนแล้วค่อย split ด้วย comma ทีเดียว
function parseZebraHostStatus(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null
    const b = raw.replace(/[\r\n]+/g, ',').split(',').map(t => t.trim()).filter(t => t !== '')
    if (b.length < 25) return null
    const flag = i => b[i] === '1'
    const printModeCode = parseInt(b[17], 10)
    return {
        // Line 1 — Communication / Error status (b1–b12)
        interfaceSettingsRaw:   b[0],
        paperOut:                flag(1),
        paused:                  flag(2),
        labelLengthDots:         parseInt(b[3], 10),
        formatsInBuffer:         parseInt(b[4], 10),
        bufferFull:              flag(5),
        diagnosticMode:          flag(6),
        partialFormat:           flag(7),
        corruptRam:              flag(9),
        underTemp:               flag(10),
        overTemp:                flag(11),
        // Line 2 — Mode / Print status (b13–b23)
        functionSettingsRaw:     b[12],
        headOpen:                flag(14),
        ribbonOut:               flag(15),
        thermalTransferMode:     flag(16),
        printModeCode,
        printModeLabel:          ZEBRA_PRINT_MODE_MAP[printModeCode] ?? `Unknown (${b[17]})`,
        printWidthRaw:           b[18],
        labelWaiting:            flag(19),
        labelsRemainingInBatch:  parseInt(b[20], 10),
        formatWhilePrinting:     flag(21),
        graphicsStored:          parseInt(b[22], 10),
        // Line 3 — Password / Memory (b24–b25)
        passwordRaw:             b[23],
        staticRamInstalled:      flag(24),
        raw: b,
    }
}

const _ZHS_TIER_COLOR = { err: 'var(--red)', warn: 'var(--amber, #d97706)', ok: 'var(--green)', info: 'var(--t2)' }

function _zhsRow(label, value, tier) {
    return `<div style="display:contents">
        <span style="color:var(--t3)">${label}</span>
        <span style="font-weight:700;color:${_ZHS_TIER_COLOR[tier]}">${value}</span>
    </div>`
}

function _zhsSection(title, rows) {
    return `<div style="font-size:9.5px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;margin:6px 0 2px">${title}</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:1px 8px;font-size:10.5px">${rows.join('')}</div>`
}

// คืน HTML ก้อนเดียว — โชว์ครบทุก field ที่มีความหมาย (ข้าม b9/b14 ที่เป็น reserved/unused ตาม doc)
function zebraHostStatusHtml(st) {
    const commRows = [
        _zhsRow('Paper',        st.paperOut ? 'Out' : 'Loaded',                 st.paperOut ? 'err' : 'ok'),
        _zhsRow('Pause',        st.paused ? 'Paused' : 'Running',               st.paused ? 'warn' : 'ok'),
        _zhsRow('Buffer',       st.bufferFull ? 'Full' : 'OK',                  st.bufferFull ? 'err' : 'ok'),
        _zhsRow('RAM',          st.corruptRam ? 'Corrupt' : 'OK',               st.corruptRam ? 'err' : 'ok'),
        _zhsRow('Temp',         st.overTemp ? 'Over' : (st.underTemp ? 'Under' : 'Normal'), (st.overTemp || st.underTemp) ? 'err' : 'ok'),
        _zhsRow('Diagnostic',   st.diagnosticMode ? 'Active' : 'Off',           st.diagnosticMode ? 'warn' : 'ok'),
        _zhsRow('Partial Fmt',  st.partialFormat ? 'In Progress' : 'None',      st.partialFormat ? 'warn' : 'ok'),
        _zhsRow('Label Length', `${isNaN(st.labelLengthDots) ? '—' : st.labelLengthDots} dots`, 'info'),
        _zhsRow('Formats Queued', isNaN(st.formatsInBuffer) ? '—' : st.formatsInBuffer, 'info'),
    ]
    const printRows = [
        _zhsRow('Print Head',   st.headOpen ? 'Open' : 'Closed',               st.headOpen ? 'err' : 'ok'),
        _zhsRow('Media Mode',   st.thermalTransferMode ? 'Thermal Transfer' : 'Direct Thermal', 'info'),
        _zhsRow('Ribbon',       st.ribbonOut ? 'Out' : (st.thermalTransferMode ? 'OK' : 'N/A'), (st.ribbonOut && st.thermalTransferMode) ? 'err' : 'info'),
        _zhsRow('Print Mode',   st.printModeLabel,                              'info'),
        _zhsRow('Label Waiting', st.labelWaiting ? 'Yes' : 'No',                st.labelWaiting ? 'warn' : 'ok'),
        _zhsRow('Batch Left',   isNaN(st.labelsRemainingInBatch) ? '—' : st.labelsRemainingInBatch, 'info'),
        _zhsRow('Fmt-While-Print', st.formatWhilePrinting ? 'Enabled' : 'Disabled', 'info'),
        _zhsRow('Graphics Stored', isNaN(st.graphicsStored) ? '—' : st.graphicsStored, 'info'),
    ]
    const memRows = [
        _zhsRow('Password',     st.passwordRaw ?? '—',                          'info'),
        _zhsRow('Static RAM',   st.staticRamInstalled ? 'Installed' : 'Not Installed', 'info'),
    ]
    return `<div style="min-width:180px">
        ${_zhsSection('Comm / Error', commRows)}
        ${_zhsSection('Mode / Print', printRows)}
        ${_zhsSection('Memory', memRows)}
        <div style="font-size:9.5px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;margin:6px 0 2px">Raw</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9.5px;color:var(--t3);word-break:break-all;line-height:1.5">${st.raw.join(',')}</div>
    </div>`
}
