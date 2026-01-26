import zipfile
import xml.etree.ElementTree as ET
import re


def load_shared_strings(z):
    try:
        with z.open("xl/sharedStrings.xml") as f:
            tree = ET.parse(f)
    except KeyError:
        return []
    root = tree.getroot()
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    strings = []
    for si in root.findall("m:si", ns):
        text_parts = []
        for node in si.iterfind(".//m:t", ns):
            if node.text:
                text_parts.append(node.text)
        strings.append("".join(text_parts))
    return strings


def read_sheet(z, sheet_name=None):
    names = [name for name in z.namelist() if name.startswith("xl/worksheets/sheet")]
    if not names:
        return [], ""
    target = (
        sheet_name
        if sheet_name and sheet_name in names
        else "xl/worksheets/sheet1.xml"
        if "xl/worksheets/sheet1.xml" in names
        else names[0]
    )
    with z.open(target) as f:
        tree = ET.parse(f)
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = []
    for row in tree.findall(".//m:row", ns):
        row_idx = int(row.attrib.get("r", "0"))
        cells = {}
        for cell in row.findall("m:c", ns):
            ref = cell.attrib.get("r", "")
            col_match = re.match(r"([A-Z]+)", ref)
            if not col_match:
                continue
            col = col_match.group(1)
            value = None
            cell_type = cell.attrib.get("t")
            v = cell.find("m:v", ns)
            if v is not None and v.text is not None:
                if cell_type == "s":
                    value = shared_strings[int(v.text)]
                else:
                    value = v.text
            else:
                inline = cell.find("m:is", ns)
                if inline is not None:
                    t_node = inline.find("m:t", ns)
                    if t_node is not None:
                        value = t_node.text
            cells[col] = value
        rows.append((row_idx, cells))
    return rows, target


with zipfile.ZipFile("BOOK CODES 2025-26.xlsx") as z:
    shared_strings = load_shared_strings(z)
    rows, sheet_path = read_sheet(z)
    print(f"Loaded sheet: {sheet_path}")
    rows_sorted = sorted(rows, key=lambda x: x[0])
    for idx, row in rows_sorted[:5]:
        sorted_cells = sorted(row.items(), key=lambda kv: kv[0])
        cells = [f"{col}:{val}" for col, val in sorted_cells]
        print(f"Row {idx}: {', '.join(cells)}")
    if rows_sorted:
        header = rows_sorted[0][1]
        print("\nHeader columns:")
        for col, val in sorted(header.items(), key=lambda kv: kv[0]):
            print(f"{col} -> {val}")
