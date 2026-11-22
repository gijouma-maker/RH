# RH – Umbau 3D (Variante 5)

Interaktives 3D-Modell des Hauses (Keller, Erdgeschoss mit Anbau, Dachgeschoss, Dach) mit dem geplanten Umbau und Möbeln im skandinavischen Stil.

**Inhalt der Planung**
- EG: Gästezimmer + Gäste-WC links vorne, Wohnen links hinten, Küche bleibt unverändert, Schlafen rechts hinten
- Kellertreppe bleibt und wird eingemauert, mit eigener Tür
- Neue moderne Treppe (Stahlwangen anthrazit, offene Eichenstufen) im mittleren Flur
- DG: neues Bad über dem Kellerschacht, Fallleitung senkrecht bis in den Keller, rechts Zimmer A und B mit Giebelfenstern

## Online stellen mit GitHub Pages
1. Bei GitHub ein neues Repository mit dem Namen **RH** anlegen (öffentlich).
2. „Add file“ → „Upload files“ → alle Dateien und den Ordner `lib` aus diesem Ordner hineinziehen → „Commit changes“.
3. „Settings“ → „Pages“ → bei „Branch“ `main` und `/ (root)` wählen → „Save“.
4. Nach 1–2 Minuten ist das Modell erreichbar unter:
   `https://<dein-github-name>.github.io/RH/`

## Bedienung
- Drehen: ziehen · Zoomen: Mausrad oder zwei Finger · Verschieben: rechte Maustaste oder zwei Finger
- Links im Menü: Etagen, Dach, Möbel und Raumnamen ein- und ausblenden, Etagen auseinanderziehen, feste Ansichten

## Hinweise
Konzeptmodell nach den Bestandsplänen; Maße gerundet. Annahmen: Raumhöhe EG 2,70 m, Decke 30 cm, Kellerhöhe 2,10 m, Dachneigung ca. 42°, Kniestock ca. 50 cm. Ersetzt keine Planung durch Architekt oder Statiker.

Technik: reines HTML/JavaScript mit [three.js](https://threejs.org) (im Ordner `lib`, MIT-Lizenz). Kein Build-Schritt nötig.
