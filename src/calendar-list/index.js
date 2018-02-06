import React, {Component} from 'react';
import {
  FlatList, Platform
} from 'react-native';
import PropTypes from 'prop-types';
import XDate from 'xdate';

import {xdateToData, parseDate} from '../interface';
import styleConstructor from './style';
import dateutils from '../dateutils';
import Calendar from '../calendar';
import CalendarListItem from './item';

// const calendarHeight = 360;
const DEFAULT_WEEK_HEIGHT = 48;
const getCalendarHeight = (date, firstDay) => {
  const day = date.getDay(); // Set Sunday from 0 to 7 because 
  const previousMonthDaysFill = day < firstDay ? 7 - (firstDay - day) : day - firstDay;
  const daysInMonth = XDate.getDaysInMonth(date.getFullYear(), date.getMonth());
  const displayWeeks = Math.floor((daysInMonth + previousMonthDaysFill) / 7);
  return displayWeeks * DEFAULT_WEEK_HEIGHT; // height per week
};

const cachedLayout = [];
const indexByMonthYear = {};
const getSequentialLayoutByRows = (index, date, firstDay) => {
  if (cachedLayout[index]) return cachedLayout[index];
  const length = getCalendarHeight(date, firstDay);
  let offset;
  if (index === 0) {
    offset = 0;
  } else {
    offset = cachedLayout[index - 1] ? (cachedLayout[index - 1].offset + cachedLayout[index - 1].length) : (index * 230);
  }
  return { index, length, offset: offset };
};

class CalendarList extends Component {
  static propTypes = {
    ...Calendar.propTypes,

    // Max amount of months allowed to scroll to the past. Default = 50
    pastScrollRange: PropTypes.number,

    // Max amount of months allowed to scroll to the future. Default = 50
    futureScrollRange: PropTypes.number,

    // Enable or disable scrolling of calendar list
    scrollEnabled: PropTypes.bool,
  };

  constructor(props) {
    super(props);
    this.pastScrollRange = props.pastScrollRange === undefined ? 50 : props.pastScrollRange;
    this.futureScrollRange = props.futureScrollRange === undefined ? 50 : props.futureScrollRange;
    this.style = styleConstructor(props.theme);
    const rows = [];
    const texts = [];
    const date = parseDate(props.current) || XDate();
    for (let i = 0; i <= this.pastScrollRange + this.futureScrollRange; i++) {
      const month = date.clone().addMonths(i - this.pastScrollRange).setDate(1);
      const text = month.toString('MMM yyyy');
      cachedLayout[i] = getSequentialLayoutByRows(i, month, props.firstDay);
      indexByMonthYear[month.toString('yyyyMM')] = i;
      rows.push(text);
      texts.push(text);
    }
    rows[this.pastScrollRange] = date;
    rows[this.pastScrollRange + 1] = date.clone().addMonths(1, true);
    if (this.pastScrollRange) {
      rows[this.pastScrollRange - 1] = date.clone().addMonths(-1, true);
    } else {
      rows[this.pastScrollRange + 2] = date.clone().addMonths(2, true);
    }
    this.state = {
      rows,
      texts,
      openDate: date,
      initialized: false
    };
    this.lastScrollPosition = -1000;
    
    this.onViewableItemsChangedBound = this.onViewableItemsChanged.bind(this);
    this.renderCalendarBound = this.renderCalendar.bind(this);
  }

  scrollToDay(d, offset, animated) {
    const day = parseDate(d);
    const indexInCache = indexByMonthYear[day.toString('yyyyMM')];
    if (indexInCache) {
      const { offset } = cachedLayout[indexInCache];
      const startOfMonthDay = day.clone().setDate(1).getDay();
      const offsetDay = startOfMonthDay - this.props.firstDay; // Number of dates of last month exist in first week of this month
                                                               // To offset the first day of month back to first day of week
      const date = day.getDate();
      const diffWeeks = Math.floor((date + offsetDay - 1) / 7);
      const scrollAmount = offset + diffWeeks * DEFAULT_WEEK_HEIGHT;
      this.listView.scrollToOffset({ offset: scrollAmount, animated });
    }
  }

  scrollToMonth(m) {
    const month = parseDate(m);
    const scrollTo = month || this.state.openDate;
    let diffMonths = this.state.openDate.diffMonths(scrollTo);
    diffMonths = diffMonths < 0 ? Math.ceil(diffMonths) : Math.floor(diffMonths);
    const calendarHeight = getCalendarHeight(month, this.props.firstDay);
    const scrollAmount = (calendarHeight * this.pastScrollRange) + (diffMonths * calendarHeight);
    //console.log(month, this.state.openDate);
    //console.log(scrollAmount, diffMonths);
    this.listView.scrollToOffset({offset: scrollAmount, animated: false});
  }

  componentWillReceiveProps(props) {
    const current = parseDate(this.props.current);
    const nextCurrent = parseDate(props.current);
    if (nextCurrent && current && nextCurrent.getTime() !== current.getTime()) {
      this.scrollToMonth(nextCurrent);
    }

    const rowclone = this.state.rows;
    const newrows = [];
    for (let i = 0; i < rowclone.length; i++) {
      let val = this.state.texts[i];
      if (rowclone[i].getTime) {
        val = rowclone[i].clone();
        val.propbump = rowclone[i].propbump ? rowclone[i].propbump + 1 : 1;
      }
      newrows.push(val);
    }
    this.setState({
      rows: newrows
    });
  }

  onViewableItemsChanged({viewableItems}) {
    function rowIsCloseToViewable(index, distance) {
      for (let i = 0; i < viewableItems.length; i++) {
        if (Math.abs(index - parseInt(viewableItems[i].index)) <= distance) {
          return true;
        }
      }
      return false;
    }

    const rowclone = this.state.rows;
    const newrows = [];
    const visibleMonths = [];

    let hasChanged = false;
    for (let i = 0; i < rowclone.length; i++) {
      let val = rowclone[i];
      const rowShouldBeRendered = rowIsCloseToViewable(i, 1);
      if (rowShouldBeRendered && !rowclone[i].getTime) {
        val = this.state.openDate.clone().addMonths(i - this.pastScrollRange, true);
      } else if (!rowShouldBeRendered) {
        val = this.state.texts[i];
      }
      newrows.push(val);
      if (val !== rowclone[i]) hasChanged = true;

      if (rowIsCloseToViewable(i, 0)) {
        visibleMonths.push(xdateToData(val));
      }
    }
    if (hasChanged) {
      if (this.props.onVisibleMonthsChange) {
        this.props.onVisibleMonthsChange(visibleMonths);
      }
      this.setState({
        rows: newrows
      });
    }
  }

  onScrollEndDrag = (e) => {
    const { y } = e.nativeEvent.contentOffset;
    const offset = Math.round(y / DEFAULT_WEEK_HEIGHT) * DEFAULT_WEEK_HEIGHT;
    this.listView.scrollToOffset({offset, animated: true});
  }

  renderCalendar = ({item, index}) => {
    const calendarHeight = cachedLayout[index].length || 0;
    return (<CalendarListItem item={item} calendarHeight={calendarHeight} {...this.props} />);
  }

  getItemLayout = (data, index) => {
    if (index === -1) return { offset: 0, length: 0, index };
    return cachedLayout[index];
  }

  getMonthIndex(month) {
    let diffMonths = this.state.openDate.diffMonths(month) + this.pastScrollRange;
    return diffMonths;
  }

  render() {
    return (
      <FlatList      
        ref={(c) => this.listView = c}
        scrollEventThrottle={400}
        style={[this.style.container, this.props.style]}
        initialListSize={this.pastScrollRange * this.futureScrollRange + 1}
        data={this.state.rows}
        //snapToAlignment='start'
        //snapToInterval={calendarHeight}
        removeClippedSubviews={Platform.OS === 'android' ? false : true}
        pageSize={1}
        onViewableItemsChanged={this.onViewableItemsChangedBound}
        renderItem={this.renderCalendarBound}
        showsVerticalScrollIndicator={false}
        scrollEnabled={this.props.scrollingEnabled !== undefined ? this.props.scrollingEnabled : true}
        keyExtractor={(item, index) => index}
        initialScrollIndex={this.state.openDate ? this.getMonthIndex(this.state.openDate) : false}
        getItemLayout={this.getItemLayout}
        onScrollEndDrag={this.onScrollEndDrag}
        // onScrollAnimationEnd={this.onScrollEndDrag}
      />
    );
  }
}

export default CalendarList;
