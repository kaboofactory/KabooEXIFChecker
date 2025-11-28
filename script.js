document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const resultsArea = document.getElementById('results-area');
    const fileNameSpan = document.getElementById('file-name');
    const metadataList = document.getElementById('metadata-list');
    const downloadBtn = document.getElementById('download-btn');

    let currentFile = null;
    let processedBlob = null;

    // Drag and Drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (processedBlob && currentFile) {
            const url = URL.createObjectURL(processedBlob);
            const a = document.createElement('a');
            a.href = url;
            const nameParts = currentFile.name.split('.');
            const ext = nameParts.pop();
            const baseName = nameParts.join('.');
            a.download = `${baseName}_checked.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });

    async function handleFile(file) {
        if (file.type !== 'image/png') {
            alert('PNGファイルのみ対応しています。');
            return;
        }

        currentFile = file;
        fileNameSpan.textContent = file.name;
        resultsArea.classList.remove('hidden');
        metadataList.innerHTML = '<li>解析中...</li>';

        try {
            const buffer = await file.arrayBuffer();
            await processPng(buffer);
        } catch (error) {
            console.error(error);
            metadataList.innerHTML = `<li>エラーが発生しました: ${error.message}</li>`;
        }
    }

    async function processPng(buffer) {
        const dataView = new DataView(buffer);
        const uint8Array = new Uint8Array(buffer);

        // Check PNG signature
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
            if (uint8Array[i] !== signature[i]) {
                alert('有効なPNGファイルではありません。');
                return;
            }
        }

        let offset = 8;
        const newChunks = [uint8Array.slice(0, 8)]; // Start with signature
        const metadataFound = [];

        const chunksToRemove = ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'pHYs', 'tIME', 'iCCP'];

        while (offset < buffer.byteLength) {
            const length = dataView.getUint32(offset);
            const type = String.fromCharCode(
                uint8Array[offset + 4],
                uint8Array[offset + 5],
                uint8Array[offset + 6],
                uint8Array[offset + 7]
            );

            const chunkDataOffset = offset + 8;
            const chunkData = uint8Array.slice(chunkDataOffset, chunkDataOffset + length);

            if (chunksToRemove.includes(type)) {
                const details = await parseMetadata(type, chunkData);
                metadataFound.push({ type, details });
                // Skip this chunk
            } else {
                // Keep this chunk
                const chunkTotalLength = 4 + 4 + length + 4;
                newChunks.push(uint8Array.slice(offset, offset + chunkTotalLength));
            }

            offset += 4 + 4 + length + 4;
        }

        // Display results
        metadataList.innerHTML = '';
        if (metadataFound.length > 0) {
            metadataFound.forEach(item => {
                const li = document.createElement('li');
                li.className = 'metadata-item';

                const details = document.createElement('details');
                details.open = true; // Open by default

                const summary = document.createElement('summary');
                summary.className = 'metadata-summary';
                summary.textContent = `[${item.type}]`;
                details.appendChild(summary);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'metadata-content';

                if (typeof item.details === 'string') {
                    const p = document.createElement('p');
                    p.className = 'simple-text';
                    p.textContent = item.details;
                    contentDiv.appendChild(p);
                } else if (Array.isArray(item.details)) {
                    // Check if it's a list of key-value strings (like Exif)
                    const isKeyValue = item.details.every(d => d.includes(': '));

                    if (isKeyValue) {
                        const table = document.createElement('table');
                        table.className = 'metadata-table';
                        item.details.forEach(detail => {
                            const [key, ...valueParts] = detail.split(': ');
                            const value = valueParts.join(': '); // Rejoin if value had colons

                            const tr = document.createElement('tr');
                            const th = document.createElement('th');
                            th.textContent = key;
                            const td = document.createElement('td');
                            td.textContent = value;

                            tr.appendChild(th);
                            tr.appendChild(td);
                            table.appendChild(tr);
                        });
                        contentDiv.appendChild(table);
                    } else {
                        // Simple list
                        const ul = document.createElement('ul');
                        item.details.forEach(detail => {
                            const subLi = document.createElement('li');
                            subLi.textContent = detail;
                            ul.appendChild(subLi);
                        });
                        contentDiv.appendChild(ul);
                    }
                } else if (typeof item.details === 'object') {
                    // Object -> Table
                    const table = document.createElement('table');
                    table.className = 'metadata-table';
                    for (const [key, value] of Object.entries(item.details)) {
                        const tr = document.createElement('tr');
                        const th = document.createElement('th');
                        th.textContent = key;
                        const td = document.createElement('td');
                        td.textContent = value;

                        tr.appendChild(th);
                        tr.appendChild(td);
                        table.appendChild(tr);
                    }
                    contentDiv.appendChild(table);
                }

                details.appendChild(contentDiv);
                li.appendChild(details);
                metadataList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.style.padding = '1rem';
            li.style.textAlign = 'center';
            li.style.color = 'var(--text-secondary)';
            li.textContent = '削除対象のメタデータは見つかりませんでした。';
            metadataList.appendChild(li);
        }

        // Reconstruct PNG
        processedBlob = new Blob(newChunks, { type: 'image/png' });
    }

    async function parseMetadata(type, data) {
        try {
            if (type === 'tEXt') {
                return parseText(data);
            } else if (type === 'zTXt') {
                return await parseZText(data);
            } else if (type === 'iTXt') {
                return await parseIText(data);
            } else if (type === 'tIME') {
                return parseTime(data);
            } else if (type === 'pHYs') {
                return parsePhys(data);
            } else if (type === 'eXIf') {
                return parseExif(data);
            } else if (type === 'iCCP') {
                return parseIccp(data);
            }
            return `サイズ: ${data.length} bytes`;
        } catch (e) {
            console.error('Parse error:', e);
            return `解析エラー (サイズ: ${data.length} bytes)`;
        }
    }

    function parseText(data) {
        // Keyword + null + Text
        let nullIndex = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0) {
                nullIndex = i;
                break;
            }
        }
        if (nullIndex === -1) return "Invalid tEXt chunk";

        const decoder = new TextDecoder('iso-8859-1');
        const keyword = decoder.decode(data.slice(0, nullIndex));
        const text = decoder.decode(data.slice(nullIndex + 1));
        return `${keyword}: ${text}`;
    }

    async function parseZText(data) {
        // Keyword + null + Compression Method (1 byte) + Compressed Text
        let nullIndex = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0) {
                nullIndex = i;
                break;
            }
        }
        if (nullIndex === -1) return "Invalid zTXt chunk";

        const decoder = new TextDecoder('iso-8859-1');
        const keyword = decoder.decode(data.slice(0, nullIndex));
        const compressionMethod = data[nullIndex + 1];

        if (compressionMethod !== 0) {
            return `${keyword}: (未知の圧縮メソッド ${compressionMethod})`;
        }

        const compressedData = data.slice(nullIndex + 2);

        try {
            // zTXt uses zlib format (RFC 1950).
            // DecompressionStream('deflate') usually expects raw deflate (RFC 1951) or sometimes zlib.
            // In Chrome/Edge, 'deflate' often handles zlib headers correctly or we might need to strip them.
            // Zlib header is usually 2 bytes (CMF, FLG).
            // Let's try to decompress directly.

            let text = await decompressData(compressedData);
            return `${keyword}: ${text}`;
        } catch (e) {
            // If direct decompression fails, try stripping 2 bytes (zlib header)
            try {
                let text = await decompressData(compressedData.slice(2));
                return `${keyword}: ${text}`;
            } catch (e2) {
                return `${keyword}: (解凍失敗)`;
            }
        }
    }

    async function decompressData(data) {
        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        writer.write(data);
        writer.close();
        const response = new Response(ds.readable);
        const arrayBuffer = await response.arrayBuffer();
        // zTXt text is ISO-8859-1 (Latin-1)
        return new TextDecoder('iso-8859-1').decode(arrayBuffer);
    }

    async function parseIText(data) {
        // Keyword + null + CompFlag + CompMethod + LangTag + null + TransKeyword + null + Text
        let p = 0;
        const findNull = (start) => {
            for (let i = start; i < data.length; i++) {
                if (data[i] === 0) return i;
            }
            return -1;
        };

        const null1 = findNull(p);
        if (null1 === -1) return "Invalid iTXt";
        const decoder = new TextDecoder('utf-8'); // iTXt uses UTF-8
        const keyword = decoder.decode(data.slice(0, null1));

        const compFlag = data[null1 + 1];
        // const compMethod = data[null1 + 2];

        let p2 = null1 + 3;
        const null2 = findNull(p2); // End of LangTag
        if (null2 === -1) return "Invalid iTXt";
        // const langTag = decoder.decode(data.slice(p2, null2));

        let p3 = null2 + 1;
        const null3 = findNull(p3); // End of TransKeyword
        if (null3 === -1) return "Invalid iTXt";
        // const transKeyword = decoder.decode(data.slice(p3, null3));

        const textBytes = data.slice(null3 + 1);
        let text = "";
        if (compFlag === 0) {
            text = decoder.decode(textBytes);
        } else {
            try {
                // iTXt compressed text is also zlib
                let decompressed = await decompressData(textBytes);
                // But wait, decompressData uses iso-8859-1, iTXt is UTF-8.
                // We need a separate decompression helper or just handle it here.

                // Let's reuse the stream logic but decode as UTF-8
                const ds = new DecompressionStream('deflate');
                const writer = ds.writable.getWriter();
                writer.write(textBytes);
                writer.close();
                const response = new Response(ds.readable);
                const arrayBuffer = await response.arrayBuffer();
                text = new TextDecoder('utf-8').decode(arrayBuffer);
            } catch (e) {
                try {
                    // Try stripping header
                    const ds = new DecompressionStream('deflate');
                    const writer = ds.writable.getWriter();
                    writer.write(textBytes.slice(2));
                    writer.close();
                    const response = new Response(ds.readable);
                    const arrayBuffer = await response.arrayBuffer();
                    text = new TextDecoder('utf-8').decode(arrayBuffer);
                } catch (e2) {
                    text = "(解凍失敗)";
                }
            }
        }

        return `${keyword}: ${text}`;
    }

    function parseTime(data) {
        if (data.length < 7) return "Invalid tIME";
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const year = view.getUint16(0);
        const month = view.getUint8(2);
        const day = view.getUint8(3);
        const hour = view.getUint8(4);
        const minute = view.getUint8(5);
        const second = view.getUint8(6);
        return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
    }

    function parsePhys(data) {
        if (data.length < 9) return "Invalid pHYs";
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const ppuX = view.getUint32(0);
        const ppuY = view.getUint32(4);
        const unit = view.getUint8(8); // 1 = meter
        const unitStr = unit === 1 ? "メートル" : "不明";
        return `X: ${ppuX} / Y: ${ppuY} (単位: ${unitStr})`;
    }

    function parseIccp(data) {
        let nullIndex = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0) {
                nullIndex = i;
                break;
            }
        }
        if (nullIndex === -1) return "Invalid iCCP";
        const decoder = new TextDecoder('iso-8859-1');
        const name = decoder.decode(data.slice(0, nullIndex));
        return `プロファイル名: ${name}`;
    }

    function parseExif(data) {
        // Basic TIFF parser
        // Header: II(0x4949) or MM(0x4D4D) + 0x002A + Offset to IFD0
        if (data.length < 8) return "Invalid Exif";

        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const isLE = data[0] === 0x49 && data[1] === 0x49;

        if (!isLE && !(data[0] === 0x4D && data[1] === 0x4D)) {
            return "Unknown Exif Header";
        }

        const magic = view.getUint16(2, isLE);
        if (magic !== 42) return "Invalid TIFF Magic";

        const ifdOffset = view.getUint32(4, isLE);
        if (ifdOffset >= data.length) return "Invalid IFD Offset";

        const tags = [];
        let offset = ifdOffset;

        // Read IFD0
        const numEntries = view.getUint16(offset, isLE);
        offset += 2;

        for (let i = 0; i < numEntries; i++) {
            if (offset + 12 > data.length) break;
            const tagId = view.getUint16(offset, isLE);
            const type = view.getUint16(offset + 2, isLE);
            const count = view.getUint32(offset + 4, isLE);
            const valueOffset = view.getUint32(offset + 8, isLE);

            let value = null;

            // Helper to read values
            const getValue = () => {
                // If data fits in 4 bytes, valueOffset contains the data (left aligned for string? no, depends on type)
                // For numeric types, it's the value.
                // For string, if <=4 chars, it's in there.

                let dataOffset = valueOffset;
                let isDirect = false;

                const typeSizes = {
                    1: 1, // Byte
                    2: 1, // ASCII
                    3: 2, // Short
                    4: 4, // Long
                    5: 8, // Rational
                    7: 1, // Undefined
                    9: 4, // SLong
                    10: 8 // SRational
                };

                const typeSize = typeSizes[type] || 1;
                const totalSize = typeSize * count;

                if (totalSize <= 4) {
                    // value is in the valueOffset field (first 4 bytes of entry + 8)
                    // Wait, the field is at offset + 8.
                    dataOffset = offset + 8;
                    isDirect = true;
                }

                if (dataOffset >= data.length) return null;

                if (type === 2) { // ASCII
                    const len = isDirect ? totalSize : count; // If direct, we read totalSize. If indirect, count is length.
                    // Actually count is number of components. For ASCII, component is byte.
                    // So count is bytes.

                    // If direct, we read from dataOffset, length is count.
                    // But we must be careful not to read past 4 bytes if direct.
                    // Actually if direct, it's padded with nulls?

                    const readLen = Math.min(count, isDirect ? 4 : data.length - dataOffset);
                    const strBytes = data.slice(dataOffset, dataOffset + readLen);
                    // Remove null terminator if present at end
                    let end = strBytes.length;
                    if (end > 0 && strBytes[end - 1] === 0) end--;
                    return new TextDecoder().decode(strBytes.slice(0, end));
                } else if (type === 3) { // Short
                    if (count === 1) {
                        return view.getUint16(dataOffset, isLE);
                    } else {
                        const vals = [];
                        for (let k = 0; k < count; k++) vals.push(view.getUint16(dataOffset + k * 2, isLE));
                        return vals.join(', ');
                    }
                } else if (type === 4) { // Long
                    if (count === 1) {
                        return view.getUint32(dataOffset, isLE);
                    } else {
                        const vals = [];
                        for (let k = 0; k < count; k++) vals.push(view.getUint32(dataOffset + k * 4, isLE));
                        return vals.join(', ');
                    }
                } else if (type === 5) { // Rational
                    // 2 Longs (Numerator, Denominator)
                    if (count === 1) {
                        const num = view.getUint32(dataOffset, isLE);
                        const den = view.getUint32(dataOffset + 4, isLE);
                        return den === 0 ? num : num / den; // Simple division
                    }
                } else if (type === 7) { // Undefined
                    // Treat as hex string
                    const len = Math.min(count, 20); // Limit display
                    const bytes = data.slice(dataOffset, dataOffset + len);
                    let hex = [];
                    for (let b of bytes) hex.push(b.toString(16).padStart(2, '0'));
                    return hex.join(' ') + (count > 20 ? '...' : '');
                } else if (type === 10) { // SRational
                    if (count === 1) {
                        const num = view.getInt32(dataOffset, isLE);
                        const den = view.getInt32(dataOffset + 4, isLE);
                        return den === 0 ? num : num / den;
                    }
                }
                return null;
            };

            value = getValue();

            // Map common Tag IDs
            const tagName = getTagName(tagId);
            if (tagName) {
                if (value !== null) {
                    tags.push(`${tagName}: ${value}`);
                } else {
                    tags.push(`${tagName} (ID: 0x${tagId.toString(16)})`);
                }
            } else {
                // Optional: Show unknown tags?
                // tags.push(`Unknown (0x${tagId.toString(16)}): ${value}`);
            }

            offset += 12;
        }

        return tags.length > 0 ? tags : "Exifデータあり (解析不能またはタグなし)";
    }

    function getTagName(id) {
        const tags = {
            0x010F: "メーカー",
            0x0110: "モデル",
            0x0112: "オリエンテーション",
            0x0131: "ソフトウェア",
            0x0132: "日時",
            0x8298: "著作権",
            0x8769: "ExifOffset",
            0x8825: "GPSInfo",
            // Exif IFD tags
            0x829A: "露出時間",
            0x829D: "F値",
            0x8822: "露出プログラム",
            0x8827: "ISO感度",
            0x9000: "Exifバージョン",
            0x9003: "撮影日時",
            0x9004: "デジタル化日時",
            0x9201: "シャッタースピード",
            0x9202: "絞り値",
            0x9204: "露出補正",
            0x9207: "測光モード",
            0x9209: "フラッシュ",
            0x920A: "焦点距離",
            0x927C: "メーカーノート",
            0x9286: "ユーザーコメント",
            0xA002: "幅",
            0xA003: "高さ",
            0xA405: "35mm換算焦点距離",
            0xA433: "レンズメーカー",
            0xA434: "レンズモデル"
        };
        return tags[id] || null;
    }
});
