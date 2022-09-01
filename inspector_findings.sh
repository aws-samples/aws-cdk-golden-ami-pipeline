#!/bin/bash
high_severity_findings_threshold=$3
ignore_findings=$2
function urldecode() { : "${*//+/ }"; echo -e "${_//%/\\x}"; }

echo "Parameter passed: $1"
which jq
y=$(urldecode "$1")
echo "decoded url is: $y"
echo $y |awk -F 'inspector' '{print $NF}' |tr -d "}\""
echo "after filter"
filter=$(echo $y |awk -F 'inspector' '{print $NF}' |tr -d "}\"") 
result="arn:aws:inspector"$filter
echo $result
aws inspector list-findings --region us-west-2 --assessment-run-arns "${result}" --filter "severities=High"
cnt_inform=$(aws inspector list-findings --region us-west-2 --assessment-run-arns "${result}" --filter "severities=Informational"| jq -r .findingArns[]|wc -l|tr -d ' ')
cnt_high=$(aws inspector list-findings --region us-west-2 --assessment-run-arns "${result}" --filter "severities=High"| jq -r .findingArns[]|wc -l|tr -d ' ')
echo "Finding with information severity: $cnt_inform"
echo "Finding with high severity: $cnt_high"

if [ ${ignore_findings} = "no" ]; then
    if [ ${cnt_high} -gt ${high_severity_findings_threshold} ]; then
        echo "Total findings with severity high is: ${cnt_high}, which is more than threshold value ${high_severity_findings_threshold}"
        echo "exiting..."
        exit 1
    fi
else
    if [ ${cnt_high} -gt ${high_severity_findings_threshold} ]; then
        echo "Total findings with severity high is: ${cnt_high}, which is more than threshold value ${high_severity_findings_threshold}"
        echo "ignore findings is set to yes"
        echo "ignoring..."

    fi
fi