const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const inputFilePath = path.join(__dirname, 'stmt.csv');  // Adjust this as needed
const outputFilePath = path.join(__dirname, 'bank_statements.json');

const results = [];
let serialCounter = 1;
const currencyCode = "INR"; // assuming all transactions are in INR

fs.createReadStream(inputFilePath) // replace with your actual CSV file name
    .pipe(csv({ separator: '\t' }))
    .on('data', (row) => {
        const transaction = {};

        // Extract fields from CSV
        const txnDesc = row['Transaction Remarks']?.trim() || "";
        const txnID = txnDesc;
        const FormatedTxnDate = txnDateTime(row['Transaction Date']);
        const FormatedPstdDate = formatDateTime(row['Transaction Date']);
        const formatedValueDate = formatDate(row['Value Date']);
        const txnsAmt = row['Withdrawl Amt(INR)']?.trim() || row['Deposit Amt(INR)']?.trim() || "0";
        const txnType = row['Withdrawl Amt(INR)'].trim() ? 'DR' : 'CR';
        const runBlc = row['Transaction Balance(INR)'];
        // const timeStamp = new Date().toISOString();

        Object.assign(transaction, {
            serialNumber: serialCounter++,
            transactionDate: FormatedTxnDate,
            pstdDate: FormatedPstdDate,
            transactionParticulars: txnDesc,
            chqNumber: "",
            valueDate: formatedValueDate,
            amount: parseFloat(txnsAmt),
            drcr: txnType,
            balance: parseFloat(runBlc),
            paymentMode: "",
            utrNumber: "",
            internalReferenceNumber: "",
            remittingBranch: "",
            remittingBankName: "",
            remittingAccountNumber: "",
            remittingAccountName: "",
            remittingIFSC: "",
            benficiaryBranch: "",
            benficiaryName: "",
            benficiaryAccountNumber: "",
            benficiaryIFSC: "",
            channel: "",
            timeStamp: "",
            remarks: "",
            transactionCurrencyCode: currencyCode,
            internalReferenceId: "",
            transactionParticular2: "",
            customerReferenceNumber: "",
            virtualAccountNumber: "",
            corporateCode: "",
            additionalField1: "",
            additionalField2: "",
            additionalField3: ""
        });

        // Extract UTR, Payment Mode, Channel
        if (txnDesc.startsWith("UPI/")) {
            transaction.utrNumber = txnDesc.split("/")[1]?.trim() || "";
            transaction.paymentMode = "UPI";
            transaction.channel = "UPI";
            transaction.virtualAccountNumber = txnDesc.split("/")[3]?.trim() || "";
        } else if (txnDesc.startsWith("R/UPI/")) {
            transaction.utrNumber = txnDesc.split("/")[2]?.trim() || "";
            transaction.paymentMode = "UPI";
            transaction.channel = "UPI";
            transaction.virtualAccountNumber = txnDesc.split("/")[4]?.trim() || "";
        } else if (txnDesc.includes("-")) {
            transaction.utrNumber = txnDesc.startsWith("R-") ? txnDesc.split("-")[1]?.trim() : txnDesc.split("-")[0]?.trim();
            transaction.paymentMode = "IMPS";
            transaction.channel = "IMPS";
        } else if (txnDesc.startsWith("NEFT/")) {
            transaction.utrNumber = txnDesc.split("/")[1]?.trim() || "";
            transaction.paymentMode = "NEFT";
            transaction.channel = "NEFT";
        } else if (txnDesc.startsWith("RTGS/")) {
            transaction.utrNumber = txnDesc.split("/")[1]?.trim() || "";
            transaction.paymentMode = "RTGS";
            transaction.channel = "RTGS";
        } else if (txnDesc.startsWith("IB")) {
            transaction.utrNumber = txnDesc.split("/")[0]?.trim() || "";
            transaction.paymentMode = "OFT";
            transaction.channel = "OFT";
        } else {
            if(txnDesc.includes('/')){
                transaction.utrNumber = txnDesc.split("/")[0]?.trim() || "";
            }else{
                transaction.utrNumber = txnDesc.trim();
            }
            transaction.paymentMode = "IFT";
            transaction.channel = "IFT";
        }

        results.push(transaction);
    })
    .on('end', () => {
    
        const outputLines = results.map(txn => JSON.stringify(txn));
        fs.writeFileSync(outputFilePath, outputLines.join('\n'));
    });

// Utility to format date from DD-MM-YYYY to YYYY-MM-DD
function formatDate(inputDate) {
    if (!inputDate) return "";
    const [dd, mm, yyyy] = inputDate.split('-');
    return `${dd}/${mm}/${yyyy}`;
}

// Utility to format date from DD-MM-YYYY HH:MM:SS to YYYY-MM-DD HH:MM:SS
function formatDateTime(dateStr) {
    if (!dateStr) return "";
    const [date, time] = dateStr.split(' ');  // Split date and time
    const [dd, mm, yyyy] = date.split('-');  // Split date into dd, mm, yyyy
    return `${dd}/${mm}/${yyyy} ${time}`;  // Reformat to YYYY-MM-DD HH:MM:SS
}

//Utility to format to transaction date
function txnDateTime(dateStr) {
    if (!dateStr) return "";
    const [date, time] = dateStr.split(' ');  // Split date and time
    const [dd, mm, yyyy] = date.split('-');  // Split date into dd, mm, yyyy
    return `${dd}/${mm}/${yyyy}`;  // Reformat to YYYY-MM-DD HH:MM:SS
}