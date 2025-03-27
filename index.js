const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const readLines = require('n-readlines');
const { json } = require('stream/consumers');

// Global variables
const BASE_URL = "https://myglivetest.escrowstack.io";
let currentDate = "";
let outputDirectoryPath = process.cwd();
const warningStr = 'Usage: node index.js <DATE (YYYY-MM-DD)>';

// Directories / file names
const eodDir = "EOD";
const bankStmtFileName = "bank_statements.json";
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJlODdjZTAzMS0yZDZmLTQ0ZjAtYmY0Zi00ODg2Yjc2ZmIzMzIiLCJuYW1lIjpbImdldF9heGlzX2JhbmtfYWNjb3VudF9zdGF0ZW1lbnQiLCJnZXRfcGF5b3V0X2xvZ19lbnRyaWVzX2RhdGVfcmFuZ2UiLCJnZXRfdmFuX2NvbGxlY3RzX2VudHJpZXNfZGF0ZV9yYW5nZSIsImNoZWNrX2FuZF9wcm9jZXNzX3N0YXR1c193aXRoX2F4aXNfYmFuayIsImdldF9wYXlvdXRfbG9nX2VudHJpZXMiLCJjaGVja19zdGF0dXNfd2l0aF9heGlzX2JhbmsiLCJyZXZlcnRfcGF5b3V0c193aXRoX3V0ciJdLCJhdXRob3JpemVkX3BlcnNvbiI6eyJuYW1lIjoiQW51c3JlZSBWaW5vZCJ9LCJ0eXBlIjoic2VydmljZSIsImVudiI6ImxpdmUiLCJpYXQiOjE3MjY1NDgwMDd9.A6GWK1uflE2Qxx28vip5QsahM4nCsXLaueA_wL2Hc8s";

let serialCounter = 0;
let bnkStmtWriterInterface;
let numberOfStmtFetchCount = 1;
const stmtArray = [];

// Process args
if (process.argv.length < 3 || process.argv.length > 4) {
    console.log(warningStr);
    process.exit(1);
} else {
    currentDate = process.argv[2];
    outputDirectoryPath += `/${eodDir}/${currentDate.split("-").join("/")}/in/`;

    let date_check_moment = moment(currentDate, 'YYYY-MM-DD', true);
    if (!date_check_moment.isValid()) {
        console.log("Invalid Date", warningStr);
        process.exit(-1);
    }

    if (process.argv.length > 3 && isStringPositiveInteger(process.argv[3])) {
        scan_increment_in_min = parseInt(process.argv[3], 10);
    }
}

// Function to ensure directory exists and create/truncate file
const setupOutputFile = () => {
    const dirPath = path.dirname(outputDirectoryPath + bankStmtFileName);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(outputDirectoryPath + bankStmtFileName, '');
    bnkStmtWriterInterface = fs.createWriteStream(outputDirectoryPath + bankStmtFileName, { flags: 'a' });
};

// Statement API Call
const getStmtApiCall = async (url, data) => {
    const options = { headers: { 'Content-Type': 'application/json', 'apikey': serviceKey } };
    try {
        const response = await axios.post(url, data, options);
        if (response.status === 200) {
            return Promise.resolve({ success: true, data: response.data });
        } else {
            return Promise.reject({ success: false, message: "No data from server." });
        }
    } catch (error) {
        console.error(error);
        return Promise.reject({ success: false, message: error.message });
    }
};

const getStatements = async (fromDate, toDate, tran_type, amtValue, curCode, LpstDate, LTxnDate, LtxnID, LsrlNo) => {
    const url = `${BASE_URL}/v1/service/get_live_account_statement_by_date`;

    const requestPayload = {
        ledger_label: "MYGROUND11409002362954",
        mode: tran_type,
        from_date: fromDate,
        to_date: toDate,
        Pagination_Details: {
            Last_Balance: {
                Amount_Value: amtValue,
                Currency_Code: curCode
            },
            Last_Pstd_Date: LpstDate,
            Last_Txn_Date: LTxnDate,
            Last_Txn_Id: LtxnID,
            Last_Txn_SrlNo: LsrlNo
        }
    };

    console.log("--------------------------------------------------------------------------------------");
    console.log("\nURL---> ", url);
    console.log(`Fetching the Statement for ${numberOfStmtFetchCount} time`);
    const response = await getStmtApiCall(url, requestPayload);
    console.log("--------------------------------------------------------------------------------------");

    const responseData = response.data;

    if (Array.isArray(responseData)) {
        const statementArray = responseData;

        let txnDesc, allTxnID, runBlc, currencyCode, pstdDate, txnDate, txnID, txnSrlNo, txnsAmt, drcr, valueDate;

        for (let stmts = 0; stmts < statementArray.length; stmts++) {
            const jsonStmts = statementArray[stmts];

            //Outer body statment paramenters
            pstdDate = jsonStmts.pstdDate ? jsonStmts.pstdDate.trim() : "";

            //TransactionSummary body
            txnsAmt = jsonStmts.transactionSummary.txnAmt.amountValue ? parseFloat(jsonStmts.transactionSummary.txnAmt.amountValue) : 0;
            txnDate = jsonStmts.transactionSummary.txnDate ? jsonStmts.transactionSummary.txnDate.trim() : "";
            txnDesc = jsonStmts.transactionSummary.txnDesc ? jsonStmts.transactionSummary.txnDesc.trim() : "";
            if(jsonStmts.transactionSummary.txnType === "D"){
                txnType = "DR";
            }else if(jsonStmts.transactionSummary.txnType === "C"){
                txnType = "CR";
            }else{
                txnType = "";
            }
            
            //TxnBalance body
            runBlc = jsonStmts.txnBalance.amountValue ? parseFloat(jsonStmts.txnBalance.amountValue.trim()) : 0;
            currencyCode = jsonStmts.txnBalance.currencyCode ? jsonStmts.txnBalance.currencyCode.trim() : "";

            //OuterBody
            allTxnID = jsonStmts.txnId.trim();
            txnID = jsonStmts.txnId ?jsonStmts.txnId.trim():"";
            txnSrlNo = jsonStmts.txnSrlNo.trim();
            valueDate = jsonStmts.valueDate ? jsonStmts.valueDate.trim() : "";


            //Formating the time statmps
            const FormatedTxnDate = moment(txnDate,"YYYY-MM-DDTHH:mm:ss.SSS").format("DD/MM/YYYY");
            const FormatedPstdDate = moment(pstdDate,"YYYY-MM-DDTHH:mm:ss.SSS").format("DD/MM/YYYY HH:mm:ss");
            const formatedValueDate = moment(valueDate,"YYYY-MM-DDTHH:mm:ss.SSS").format("DD/MM/YYYY");
            const timeStamp = moment(pstdDate,"YYYY-MM-DDTHH:mm:ss.SSS").format("HH:mm:ss");

            // Increment serial number for each transaction
            serialCounter++;

            const transaction = {
                serialNumber: serialCounter,
                transactionDate: FormatedTxnDate,
                pstdDate: FormatedPstdDate,
                transactionParticulars: txnDesc,
                chqNumber: "",
                valueDate: formatedValueDate,
                amount: txnsAmt,
                drcr: txnType,
                balance: runBlc,
                paymentMode: "", //added
                utrNumber: "",  //added
                internalReferenceNumber: txnID,
                remittingBranch: "",
                remittingBankName: "",
                remittingAccountNumber: "",
                remittingAccountName: "",
                remittingIFSC: "",
                benficiaryBranch: "",
                benficiaryName: "",
                benficiaryAccountNumber: "",
                benficiaryIFSC: "",
                channel: "", //added
                timeStamp: timeStamp, 
                remarks: "",
                transactionCurrencyCode: currencyCode,
                internalReferenceId: "",
                transactionParticular2: "",
                customerReferenceNumber: "",
                virtualAccountNumber: "", //added
                corporateCode: "",
                additionalField1: "",
                additionalField2: "",
                additionalField3: ""
            };

            let utr_rrn, upi_id, mode;

            // UPI transaction handling
            // Extract UTR number based on transaction type
            if (txnDesc.startsWith("UPI/")) {
                transaction.utrNumber = txnDesc === ""?"":txnDesc.split("/")[1].trim();
                transaction.paymentMode = "UPI";
                transaction.channel = "UPI";
                transaction.virtualAccountNumber = txnDesc ? txnDesc.split("/")[3].trim():"";
            }
            else if (txnDesc.startsWith("R/UPI/")) {
                transaction.utrNumber = txnDesc === ""?"":txnDesc.split("/")[2].trim();
                transaction.paymentMode = "UPI";
                transaction.channel = "UPI";
                transaction.virtualAccountNumber = txnDesc ? txnDesc.split("/")[4].trim():"";
            }
            else if (txnDesc.includes("-")) {
                if (txnDesc.startsWith("R-")) {
                    transaction.utrNumber = txnDesc === ""?"":txnDesc.split("-")[1].trim();
                } else {
                    transaction.utrNumber = txnDesc === ""?"":txnDesc.split("-")[0].trim();
                }
                transaction.paymentMode = "IMPS";
                transaction.channel = "IMPS";
            }
            else if (txnDesc.startsWith("NEFT/")) {
                transaction.utrNumber = txnDesc === ""?"":txnDesc.split("/")[1].trim();
                transaction.paymentMode = "NEFT";
                transaction.channel = "NEFT";
            }
            // RTGS transaction
            else if (txnDesc.startsWith("RTGS/")) {
                transaction.utrNumber = txnDesc === ""?"":txnDesc.split("/")[1].trim();  // Extract number after "NEFT/"
                transaction.paymentMode = "RTGS";
                transaction.channel = "RTGS";
            }
            // IFT or other transactions fall back to txnId
            else {
                transaction.utrNumber = txnDesc === ""?"":txnDesc.trim();
                transaction.paymentMode = "IFT";
                transaction.channel = "IFT";
            }

            /**
             * Validating the postDate with statment fetch Date if both are matching pushing to stmtArray
             */
            const stmtTxnDate = moment(pstdDate,"YYYY-MM-DDTHH:mm:ss.SSS").format("YYYY-MM-DD");
            let stmtFetchDate = moment(currentDate, 'YYYY-MM-DD').format('YYYY-MM-DD');

            if(stmtTxnDate === stmtFetchDate){
                stmtArray.push(transaction);
            }
        }

        // Recursive call for pagination
        numberOfStmtFetchCount++;
        await getStatements(fromDate, toDate, "B", runBlc, currencyCode, pstdDate, txnDate, txnID, txnSrlNo);
    } else {
        if (responseData.error_msg === "No record could be retrieved") {
            console.log("Statement Fetch is done");
        } else {
            console.error("ERROR: Check Once");
        }
    }
};

const startProcess = async () => {
    setupOutputFile();

    let prevDate = moment(currentDate, 'YYYY-MM-DD').subtract(1,'days').format('YYYY-MM-DD');
    // let fromDate = moment(currentDate, 'YYYY-MM-DD').format('YYYY-MM-DD');
    let nextDate = moment(currentDate, 'YYYY-MM-DD').add(1,'days').format('YYYY-MM-DD');

    await getStatements(
        prevDate, // fromDate
        nextDate, // toDate
        "B",      // tran_type
        "",       // amtValue
        "",       // curCode
        "",       // LpstDate
        "",       // LTxnDate
        "",       // LtxnID
        ""        // LsrlNo
    );

    for (let i = 0; i < stmtArray.length; i++) {
        bnkStmtWriterInterface.write(`${JSON.stringify(stmtArray[i])}\n`);
    }
    bnkStmtWriterInterface.end();
};

startProcess();