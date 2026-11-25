"""Génère le modèle Excel d'import des salariés (static/modele-import-salaries.xlsx)."""
import pathlib
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
COLS = [('Matricule', '001', 10), ('Nom *', 'ALAOUI', 16), ('Prénom', 'Karim', 14), ('CIN', 'BE123456', 12), ('N° CNSS', '123456789', 13),
        ('Date de naissance', '15/03/1990', 14), ('Date d’embauche *', '01/09/2022', 15), ('Fonction', 'Comptable', 16),
        ('Type de contrat', 'CDI', 13), ('Fin de CDD', '', 12), ('Type de salaire', 'mensuel', 13), ('Salaire de base mensuel', 8000, 14),
        ('Taux horaire', '', 11), ('Heures par mois', 191, 11), ('Situation familiale', 'Marié(e)', 15), ('Conjoint à charge', 'oui', 11),
        ('Enfants à charge', 2, 10), ('Mode de paiement', 'Virement', 13), ('Banque', 'Attijariwafa bank', 16), ('RIB (24 chiffres)', '007450000123456789012345', 27),
        ('E-mail', 'k.alaoui@exemple.ma', 22), ('Téléphone', '0612345678', 13), ('Adresse', '12 rue Ibn Sina, Marrakech', 28)]
wb = Workbook(); ws = wb.active; ws.title = 'Salariés'
for i, (h, ex, w) in enumerate(COLS, 1):
    c = ws.cell(1, i, h); c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='13233A'); c.alignment = Alignment(wrap_text=True, vertical='center')
    ws.cell(2, i, ex); ws.column_dimensions[c.column_letter].width = w
ws.row_dimensions[1].height = 32; ws.freeze_panes = 'C2'
for col in ('D', 'E', 'F', 'G', 'J', 'T', 'V'):
    for r in range(2, 502): ws[f'{col}{r}'].number_format = '@'
def liste(col, valeurs):
    dv = DataValidation(type='list', formula1='"' + ','.join(valeurs) + '"', allow_blank=True); ws.add_data_validation(dv); dv.add(f'{col}2:{col}501')
liste('I', ['CDI', 'CDD', 'ANAPEC']); liste('K', ['mensuel', 'horaire']); liste('O', ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)']); liste('P', ['oui', 'non']); liste('R', ['Virement', 'Chèque', 'Espèces'])
ci = wb.create_sheet('Consignes')
for r, t in enumerate([
    'Import des salariés dans RM Paie', '',
    '1. Une ligne par salarié, à partir de la ligne 2 (remplacez ou supprimez l’exemple).',
    '2. Colonnes obligatoires : Nom et Date d’embauche. Les autres peuvent rester vides et être complétées ensuite.',
    '3. Dates au format JJ/MM/AAAA. Montants en chiffres, sans « DH ».',
    '4. Type de contrat : CDI, CDD ou ANAPEC (stage Idmaj). Type de salaire : mensuel ou horaire.',
    '5. Un salarié dont le matricule ou la CIN existe déjà dans le dossier est mis à jour, pas dupliqué.',
    '6. Ne modifiez pas l’ordre ni le titre des colonnes. Vous pouvez aussi enregistrer ce fichier en CSV (séparateur point-virgule).',
    '7. Dans RM Paie : onglet Salariés > Importer depuis Excel. Un aperçu signale les erreurs avant tout enregistrement.'], 1):
    ci.cell(r, 1, t).font = Font(bold=(r == 1), size=13 if r == 1 else 11)
ci.column_dimensions['A'].width = 110
out = pathlib.Path(__file__).resolve().parent.parent / 'static' / 'modele-import-salaries.xlsx'; wb.save(out); print('modèle :', out)
